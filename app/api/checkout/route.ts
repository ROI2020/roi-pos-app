import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { createCheckoutPreference, type MPPreferenceItem } from '@/lib/mp'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'

/**
 * POST /api/checkout
 *
 * Endpoint público — sin autenticación.
 * Resuelve el negocio desde el dominio para aislar datos y pasarela de pago.
 *
 * Valida stock, crea online_order con status='awaiting_payment',
 * crea la Preference de MercadoPago y devuelve el init_point.
 * El stock se descuenta al confirmar en el admin (una vez pagado).
 *
 * Body:
 * {
 *   items: { variantId, unitPrice, productName, variantSku, color, size }[]
 *   buyerName:      string
 *   buyerPhone:     string          -- con código de país, ej: '5491112345678'
 *   buyerEmail?:    string
 *   deliveryType:   'pickup_store' | 'homeDelivery' | 'agency' | 'locker'
 *   shippingRateId?: number         -- si deliveryType != pickup_store
 *   agencyId?:       string         -- si deliveryType = 'agency' | 'locker'
 *   address?: {
 *     streetName, streetNumber, floor?, department?,
 *     cityName, state, zipCode, observation?
 *   }
 *   notes?: string
 * }
 *
 * Responde:
 * {
 *   orderId:   number
 *   initPoint: string   -- URL de pago de MercadoPago (redirigir al cliente)
 *   total:     number
 * }
 *
 * En caso de stock insuficiente → 422 con los variantIds no disponibles.
 */
export async function POST(req: Request) {
  try {
    // ── Resolver negocio desde el dominio ─────────────────────────────────────
    const host = req.headers.get('host') ?? ''
    const businessId = await resolveBusinessFromHost(host)

    // ── Leer configuración del negocio ────────────────────────────────────────
    const bSettings = await getPublicSettingsByKeys(businessId, [
      'payment_gateway', 'currency',
    ])
    const paymentGateway = bSettings.payment_gateway ?? 'mercadopago'
    const currency       = bSettings.currency        ?? 'ARS'

    const body = await req.json() as {
      items: {
        variantId:   number
        unitPrice:   number
        productName: string
        variantSku:  string
        color:       string
        size:        string
      }[]
      buyerName:      string
      buyerPhone:     string
      buyerEmail?:    string
      deliveryType:   'pickup_store' | 'homeDelivery' | 'agency' | 'locker'
      shippingRateId?: number
      agencyId?:       string
      address?: {
        streetName:   string
        streetNumber: string
        floor?:       string
        department?:  string
        cityName:     string
        state:        string
        zipCode:      string
        observation?: string
      }
      notes?: string
    }

    // ── Validaciones básicas ────────────────────────────────────────────────
    if (!body.items?.length)    return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
    if (!body.buyerName?.trim()) return NextResponse.json({ error: 'Nombre del comprador requerido' }, { status: 400 })
    if (!body.buyerPhone?.trim()) return NextResponse.json({ error: 'Teléfono del comprador requerido' }, { status: 400 })
    if (!body.deliveryType)     return NextResponse.json({ error: 'Tipo de entrega requerido' }, { status: 400 })

    if (body.deliveryType === 'homeDelivery' && !body.address) {
      return NextResponse.json({ error: 'Dirección de envío requerida' }, { status: 400 })
    }
    if ((body.deliveryType === 'agency' || body.deliveryType === 'locker') && !body.agencyId) {
      return NextResponse.json({ error: 'Sucursal de retiro requerida' }, { status: 400 })
    }

    const variantIds = body.items.map(i => i.variantId)

    // ── Verificar stock + que las variantes pertenecen al negocio ─────────────
    // Para productos físicos: deben tener al menos 1 fila en branch_inventory.
    // Para productos CJ Dropshipping (cj_pid NOT NULL): stock virtual ilimitado,
    //   no requieren branch_inventory (CJ gestiona el fulfillment).
    const { rows: stockRows } = await pool.query<{ product_variant_id: number }>(
      `SELECT DISTINCT bi.product_variant_id
       FROM branch_inventory bi
       JOIN product_variants pv ON pv.id = bi.product_variant_id
       JOIN products p          ON p.id  = pv.product_id
       WHERE bi.product_variant_id = ANY($1::int4[])
         AND p.business_id = $2
       UNION
       SELECT DISTINCT pv.id
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ANY($1::int4[])
         AND p.business_id = $2
         AND p.cj_pid IS NOT NULL`,
      [variantIds, businessId]
    )
    const inStock = new Set(stockRows.map(r => r.product_variant_id))
    const outOfStock = variantIds.filter(id => !inStock.has(id))

    if (outOfStock.length > 0) {
      return NextResponse.json(
        { error: 'Algunos productos ya no tienen stock', outOfStock },
        { status: 422 }
      )
    }

    // ── Calcular totales ───────────────────────────────────────────────────
    const subtotal = body.items.reduce((sum, i) => sum + i.unitPrice, 0)

    let shippingCost = 0
    if (body.shippingRateId) {
      const { rows: rateRows } = await pool.query<{ price: number }>(
        `SELECT sr.price::float
         FROM shipping_rates sr
         JOIN correo_config cc ON cc.id = sr.correo_config_id
         WHERE sr.id = $1
           AND sr.active = true
           AND cc.business_id = $2`,
        [body.shippingRateId, businessId]
      )
      shippingCost = rateRows[0]?.price ?? 0
    }

    const total = subtotal + shippingCost

    // ── Todo en una transacción ────────────────────────────────────────────
    const client = await pool.connect()
    let orderId: number
    try {
      await client.query('BEGIN')

      // Buscar o crear customer del negocio
      const phone = body.buyerPhone.trim()
      const { rows: custRows } = await client.query<{ id: number }>(
        `INSERT INTO customers (name, phone, business_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (phone, business_id)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [body.buyerName.trim(), phone, businessId]
      )
      const customerId = custRows[0].id

      // Crear dirección si aplica
      let shippingAddressId: number | null = null
      if (body.deliveryType === 'homeDelivery' && body.address) {
        const addr = body.address
        const { rows: addrRows } = await client.query<{ id: number }>(
          `INSERT INTO shipping_addresses
             (customer_id, street_name, street_number, floor, department,
              city_name, state, zip_code, observation)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [
            customerId,
            addr.streetName,   addr.streetNumber,
            addr.floor ?? null, addr.department ?? null,
            addr.cityName,     addr.state,
            addr.zipCode,      addr.observation ?? null,
          ]
        )
        shippingAddressId = addrRows[0].id
      }

      // Crear online_order con status='awaiting_payment'
      // El pago se confirma vía webhook de MP → status pasa a 'pending'
      const { rows: orderRows } = await client.query<{ id: number }>(
        `INSERT INTO online_orders
           (business_id, customer_id, buyer_name, buyer_phone, buyer_email,
            delivery_type, shipping_address_id, agency_id, shipping_rate_id,
            subtotal, shipping_cost, total, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'awaiting_payment')
         RETURNING id`,
        [
          businessId,
          customerId,
          body.buyerName.trim(),
          phone,
          body.buyerEmail?.trim() ?? null,
          body.deliveryType,
          shippingAddressId,
          body.agencyId ?? null,
          body.shippingRateId ?? null,
          subtotal, shippingCost, total,
          body.notes?.trim() ?? null,
        ]
      )
      orderId = orderRows[0].id

      // Crear items
      for (const item of body.items) {
        await client.query(
          `INSERT INTO online_order_items
             (online_order_id, product_variant_id, unit_price,
              product_name, variant_sku, variant_color, variant_size)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, item.variantId, item.unitPrice,
           item.productName, item.variantSku, item.color, item.size]
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // ── Crear Preference según la pasarela del negocio ────────────────────
    // (fuera de la TX de DB — si falla el gateway, el pedido queda en
    //  awaiting_payment y puede reintentarse o limpiarse por un job)
    if (paymentGateway !== 'mercadopago') {
      // TODO Fase 4: PayPal Smart Buttons y otros gateways
      return NextResponse.json(
        { error: `Pasarela '${paymentGateway}' no implementada aún` },
        { status: 501 }
      )
    }

    const mpItems: MPPreferenceItem[] = body.items.map(item => ({
      id:          String(item.variantId),
      title:       `${item.productName} (${item.color}, T.${item.size})`,
      quantity:    1,
      unit_price:  item.unitPrice,
      currency_id: currency,
    }))

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'

    const { preferenceId, initPoint } = await createCheckoutPreference({
      businessId,
      orderId,
      items:        mpItems,
      shippingCost,
      payerEmail:   body.buyerEmail?.trim() ?? null,
      payerName:    body.buyerName.trim(),
      baseUrl,
      currency,
    })

    // Guardar el preferenceId en el pedido
    await pool.query(
      `UPDATE online_orders SET mp_preference_id = $1 WHERE id = $2`,
      [preferenceId, orderId]
    )

    return NextResponse.json({ orderId, initPoint, total }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/checkout]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
