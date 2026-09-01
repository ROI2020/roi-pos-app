import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'
import { getPayPalToken, createPayPalOrder, type PayPalOrderItem } from '@/lib/paypal'

/**
 * POST /api/paypal/create-order
 *
 * Endpoint PÚBLICO — sin autenticación.
 * Equivalente a /api/checkout pero para el gateway PayPal.
 *
 * 1. Valida stock y que las variantes pertenezcan al negocio
 * 2. Crea el online_order en DB con status='awaiting_payment'
 * 3. Crea la orden en PayPal y devuelve el paypalOrderId
 *    (el frontend usa ese ID para lanzar los Smart Buttons)
 *
 * Body: mismo que /api/checkout
 *
 * Responde:
 * { paypalOrderId: string, internalOrderId: number }
 */
export async function POST(req: Request) {
  try {
    const host       = req.headers.get('host') ?? ''
    const businessId = await resolveBusinessFromHost(host)

    // ── Settings del negocio ───────────────────────────────────────────────
    const pubSettings = await getPublicSettingsByKeys(businessId, [
      'paypal_client_id', 'paypal_mode', 'currency',
    ])
    const paypalClientId = pubSettings.paypal_client_id
    const paypalMode     = pubSettings.paypal_mode ?? 'sandbox'
    const currency       = pubSettings.currency    ?? 'USD'

    if (!paypalClientId) {
      return NextResponse.json({ error: 'PayPal no configurado para este negocio' }, { status: 503 })
    }

    const clientSecret = await getSecretSetting(businessId, 'paypal_client_secret')
    if (!clientSecret) {
      return NextResponse.json({ error: 'Credenciales PayPal incompletas' }, { status: 503 })
    }

    // ── Body ───────────────────────────────────────────────────────────────
    const body = await req.json() as {
      items: {
        variantId:   number
        unitPrice:   number
        quantity?:   number
        productName: string
        variantSku:  string
        color:       string
        size:        string
      }[]
      buyerName:      string
      buyerPhone:     string
      buyerEmail?:    string
      deliveryType:   'pickup_store' | 'homeDelivery' | 'agency'
      shippingRateId?: number
      cjShippingCost?: number   // Para productos CJ: costo de envío CJ (no hay shipping_rate en DB)
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
    }

    if (!body.items?.length)      return NextResponse.json({ error: 'Carrito vacío' },           { status: 400 })
    if (!body.buyerName?.trim())  return NextResponse.json({ error: 'Nombre requerido' },         { status: 400 })
    if (!body.buyerPhone?.trim()) return NextResponse.json({ error: 'Teléfono requerido' },       { status: 400 })
    if (!body.deliveryType)       return NextResponse.json({ error: 'Tipo de entrega requerido' }, { status: 400 })
    if (body.deliveryType === 'homeDelivery' && !body.address) {
      return NextResponse.json({ error: 'Dirección de envío requerida' }, { status: 400 })
    }

    const variantIds = body.items.map(i => i.variantId)

    // ── Verificar stock + pertenencia al negocio ───────────────────────────
    // Físicos: necesitan branch_inventory. CJ dropshipping (cj_pid NOT NULL):
    // stock virtual, CJ maneja fulfillment → bypass branch_inventory.
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
      [variantIds, businessId],
    )
    const inStock    = new Set(stockRows.map(r => r.product_variant_id))
    const outOfStock = variantIds.filter(id => !inStock.has(id))
    if (outOfStock.length > 0) {
      return NextResponse.json({ error: 'Sin stock', outOfStock }, { status: 422 })
    }

    // ── Totales ────────────────────────────────────────────────────────────
    const subtotal = body.items.reduce((s, i) => s + i.unitPrice * (i.quantity ?? 1), 0)

    let shippingCost = 0
    if (body.shippingRateId) {
      // Correo Argentino: buscar tarifa real en DB
      const { rows } = await pool.query<{ price: number }>(
        `SELECT sr.price::float
         FROM shipping_rates sr
         JOIN correo_config cc ON cc.id = sr.correo_config_id
         WHERE sr.id = $1 AND sr.active = true AND cc.business_id = $2`,
        [body.shippingRateId, businessId],
      )
      shippingCost = rows[0]?.price ?? 0
    } else if (body.cjShippingCost && body.cjShippingCost > 0) {
      // CJ Dropshipping: el costo viene del frontend (opciones de CJ no están en shipping_rates)
      shippingCost = body.cjShippingCost
    }

    const total = subtotal + shippingCost

    // ── Transacción DB: customer + address + online_order + items ──────────
    const client = await pool.connect()
    let orderId: number
    try {
      await client.query('BEGIN')

      const { rows: custRows } = await client.query<{ id: number }>(
        `INSERT INTO customers (name, phone, business_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (phone, business_id) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [body.buyerName.trim(), body.buyerPhone.trim(), businessId],
      )
      const customerId = custRows[0].id

      let shippingAddressId: number | null = null
      if (body.deliveryType === 'homeDelivery' && body.address) {
        const a = body.address
        const { rows: addrRows } = await client.query<{ id: number }>(
          `INSERT INTO shipping_addresses
             (customer_id, street_name, street_number, floor, department,
              city_name, state, zip_code, observation)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [customerId, a.streetName, a.streetNumber, a.floor ?? null,
           a.department ?? null, a.cityName, a.state, a.zipCode, a.observation ?? null],
        )
        shippingAddressId = addrRows[0].id
      }

      const { rows: orderRows } = await client.query<{ id: number }>(
        `INSERT INTO online_orders
           (business_id, customer_id, buyer_name, buyer_phone, buyer_email,
            delivery_type, shipping_address_id, agency_id, shipping_rate_id,
            subtotal, shipping_cost, total, status, payment_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'awaiting_payment','paypal')
         RETURNING id`,
        [
          businessId, customerId,
          body.buyerName.trim(), body.buyerPhone.trim(), body.buyerEmail?.trim() ?? null,
          body.deliveryType, shippingAddressId,
          body.agencyId ?? null, body.shippingRateId ?? null,
          subtotal, shippingCost, total,
        ],
      )
      orderId = orderRows[0].id

      for (const item of body.items) {
        await client.query(
          `INSERT INTO online_order_items
             (online_order_id, product_variant_id, unit_price, quantity,
              product_name, variant_sku, variant_color, variant_size)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [orderId, item.variantId, item.unitPrice, item.quantity ?? 1,
           item.productName, item.variantSku, item.color, item.size],
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // ── Crear orden en PayPal ──────────────────────────────────────────────
    const paypalItems: PayPalOrderItem[] = body.items.map(i => ({
      name:       `${i.productName} (${i.color}, ${i.size})`,
      unit_price: i.unitPrice,
      quantity:   i.quantity ?? 1,
    }))

    const token         = await getPayPalToken(paypalClientId, clientSecret, paypalMode)
    const paypalOrderId = await createPayPalOrder({
      token,
      mode:        paypalMode,
      currency,
      subtotal,
      shipping:    shippingCost,
      items:       paypalItems,
      referenceId: orderId,
    })

    // Guardar el PayPal Order ID para poder rastrearlo en el panel de PayPal
    await pool.query(
      `UPDATE online_orders SET paypal_order_id = $1 WHERE id = $2`,
      [paypalOrderId, orderId],
    )

    return NextResponse.json({ paypalOrderId, internalOrderId: orderId }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/paypal/create-order]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
