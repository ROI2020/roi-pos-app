import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { createOrder as paqarCreateOrder } from '@/lib/correo/correoArgentino'
import { calcBulkDimensions } from '@/lib/correo/dimensions'
import { insertTransaction } from '@/lib/transactions'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { syncMLStockForVariants }    from '@/lib/ml-stock-sync'
import { sendShipmentNotification } from '@/lib/email-order'

/**
 * PATCH /api/orders/online/:id/confirm
 *
 * El admin confirma el pedido:
 * 1. Reverifica stock (optimista — puede haber pasado tiempo).
 * 2. En transacción: crea sale + sale_details (descuenta stock de branch_inventory).
 *    Actualiza online_order.status = 'confirmed'.
 * 3. Si delivery != pickup_store: llama a PAQ.AR y crea shipment.
 *    Si PAQ.AR falla → shipment con status='error', la venta NO se revierte.
 *
 * Requiere auth.
 */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { id } = await params
  const orderId = parseInt(id)

  try {
    // ── Leer mp_fop_id de settings (antes de la TX, no bloquea) ────────────
    const pubSettings = await getPublicSettingsByKeys(businessId, ['mp_fop_id'])
    const mpFopId     = pubSettings.mp_fop_id ? parseInt(pubSettings.mp_fop_id) : null

    if (!mpFopId) {
      console.warn(
        `[confirm order ${orderId}] mp_fop_id no configurado — ` +
        'la venta NO se registrará en transactions. Configurarlo en Ajustes → Pagos.'
      )
    }

    // ── Cargar pedido ───────────────────────────────────────────────────────
    const { rows: orderRows } = await pool.query<{
      id: number; status: string; delivery_type: string; agency_id: string | null
      buyer_name: string; buyer_phone: string
      subtotal: number; shipping_cost: number; total: number
      shipping_address_id: number | null
      shipping_rate_id: number | null; correo_config_id: number | null
      environment: string | null
    }>(
      `SELECT
         oo.id, oo.status, oo.delivery_type, oo.agency_id,
         oo.buyer_name, oo.buyer_phone,
         oo.subtotal::float, oo.shipping_cost::float, oo.total::float,
         oo.shipping_address_id,
         oo.shipping_rate_id,
         cc.id   AS correo_config_id,
         cc.environment
       FROM online_orders oo
       LEFT JOIN shipping_rates sr ON sr.id = oo.shipping_rate_id
       LEFT JOIN correo_config  cc ON cc.id = sr.correo_config_id
       WHERE oo.id = $1 AND oo.business_id = $2`,
      [orderId, businessId]
    )

    if (!orderRows.length)
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const order = orderRows[0]
    if (order.status !== 'pending')
      return NextResponse.json({ error: `El pedido ya está en estado '${order.status}'` }, { status: 409 })

    // ── Cargar items ────────────────────────────────────────────────────────
    // Incluye is_cj para separar variantes CJ (sin branch_inventory) de físicas.
    const { rows: items } = await pool.query<{
      product_variant_id: number; unit_price: number; is_cj: boolean
    }>(
      `SELECT oi.product_variant_id,
              oi.unit_price::float,
              (p.cj_pid IS NOT NULL) AS is_cj
       FROM online_order_items oi
       JOIN product_variants pv ON pv.id = oi.product_variant_id
       JOIN products p          ON p.id  = pv.product_id
       WHERE oi.online_order_id = $1`,
      [orderId]
    )

    const physicalVariantIds = items.filter(i => !i.is_cj).map(i => i.product_variant_id)
    const hasCJItems         = items.some(i => i.is_cj)

    // ── Re-verificar stock (solo productos físicos) ─────────────────────────
    // Los productos CJ no tienen branch_inventory — el stock lo gestiona CJ.
    if (physicalVariantIds.length > 0) {
      const { rows: stockRows } = await pool.query<{ product_variant_id: number }>(
        `SELECT DISTINCT product_variant_id
         FROM branch_inventory
         WHERE product_variant_id = ANY($1::int4[])`,
        [physicalVariantIds]
      )
      const inStock    = new Set(stockRows.map(r => r.product_variant_id))
      const outOfStock = physicalVariantIds.filter(id => !inStock.has(id))

      if (outOfStock.length > 0) {
        return NextResponse.json(
          { error: 'Algunos items ya no tienen stock', outOfStock },
          { status: 422 }
        )
      }
    }

    const variantIds = items.map(i => i.product_variant_id)

    // ── Branch para ventas online ───────────────────────────────────────────
    // Preferencia: settings.online_branch_id (sucursal dedicada con CUIT propio).
    // Fallback: primera sucursal del negocio.
    // Para configurar: INSERT INTO settings (business_id, key, value)
    //   VALUES (1, 'online_branch_id', '<id_de_la_sucursal_online>');
    const { rows: branchRows } = await pool.query<{ id: number }>(
      `SELECT COALESCE(
         (SELECT value::int FROM settings
          WHERE business_id = $1 AND key = 'online_branch_id' LIMIT 1),
         (SELECT id FROM branches WHERE business_id = $1 ORDER BY id LIMIT 1)
       ) AS id`,
      [businessId]
    )
    const branchId = branchRows[0]?.id
    if (!branchId)
      return NextResponse.json({ error: 'No hay sucursal configurada' }, { status: 500 })

    // ── Transacción: crear venta y descontar stock ──────────────────────────
    const client = await pool.connect()
    let saleId: number

    try {
      await client.query('BEGIN')

      // Usar subtotal/shipping_cost del pedido (ya calculados al crear el checkout)
      const subtotal     = order.subtotal
      const shippingCost = order.shipping_cost

      // Crear sale
      // total_amount = subtotal + shipping_cost (incluye el envío para cuadrar caja)
      // shipping_amount = shipping_cost (para KPI de correo vs gastos de envío)
      const { rows: saleRows } = await client.query<{ id: number }>(
        `INSERT INTO sales
           (branch_id, customer_id, subtotal, discount_amount, total_amount,
            shipping_amount, payment_method, business_id)
         SELECT $1,
                oo.customer_id,
                $2, 0, $3,
                $4,
                'mp_online',
                $5
         FROM online_orders oo WHERE oo.id = $6
         RETURNING id`,
        [branchId, subtotal, order.total, shippingCost, businessId, orderId]
      )
      saleId = saleRows[0].id

      // Crear sale_details (todos los ítems, CJ y físicos por igual — contabilidad).
      // Descontar stock solo para productos físicos; CJ no usa branch_inventory.
      for (const item of items) {
        await client.query(
          `INSERT INTO sale_details (sale_id, product_variant_id, unit_price)
           VALUES ($1, $2, $3)`,
          [saleId, item.product_variant_id, item.unit_price]
        )
        if (!item.is_cj) {
          await client.query(
            `DELETE FROM branch_inventory
             WHERE product_variant_id = $1
               AND id = (
                 SELECT id FROM branch_inventory
                 WHERE product_variant_id = $1 LIMIT 1
               )`,
            [item.product_variant_id]
          )
        }
      }

      // Actualizar estado del pedido
      await client.query(
        `UPDATE online_orders
         SET status = 'confirmed', sale_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [saleId, orderId]
      )

      // ── Registrar en transactions (misma TX para atomicidad) ──────────────
      // Usa el fop_id configurado en Ajustes → Pagos → "Forma de pago en el libro".
      // Si no está configurado, la venta queda sin fila en transactions (ya se logueó).
      if (mpFopId) {
        await insertTransaction(client, {
          businessId,
          branchId,
          fopId:  mpFopId,
          type:   'sale',
          typeId: saleId,
          amount: order.total,
        })
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Sincronizar stock físico a ML en background (no bloquea la respuesta)
    if (physicalVariantIds.length > 0) {
      syncMLStockForVariants(businessId, physicalVariantIds).catch(e =>
        console.error(`[confirm order ${orderId}] ML stock sync error:`, e)
      )
    }

    // ── Crear envío en PAQ.AR (fuera de la transacción de venta) ───────────
    // Los pedidos 100% CJ no usan PAQ.AR — CJ gestiona su propio despacho.
    // Si hay ítems físicos mezclados con CJ, PAQ.AR solo cubre los físicos
    // (caso edge — se loguea para revisión manual).
    let shipmentResult: { trackingNumber?: string; error?: string } = {}

    if (hasCJItems && physicalVariantIds.length === 0) {
      // Pedido puro CJ — nada que hacer con PAQ.AR.
      // El fulfillment ya fue enviado a CJ en el momento del pago (capture-order).
      console.info(`[confirm order ${orderId}] Pedido CJ — PAQ.AR omitido`)
    } else if (order.delivery_type !== 'pickup_store') {
      try {
        // Calcular dimensiones del bulto (solo ítems físicos; CJ no tiene dims en DB)
        const dimsVariants = physicalVariantIds.length > 0 ? physicalVariantIds : variantIds
        const dims = await calcBulkDimensions(dimsVariants)

        // Cargar dirección si es homeDelivery
        let paqarAddress
        if (order.delivery_type === 'homeDelivery' && order.shipping_address_id) {
          const { rows: addrRows } = await pool.query<{
            street_name: string; street_number: string; floor: string | null
            department: string | null; city_name: string; state: string
            zip_code: string; observation: string | null
          }>(
            `SELECT street_name, street_number, floor, department,
                    city_name, state, zip_code, observation
             FROM shipping_addresses WHERE id = $1`,
            [order.shipping_address_id]
          )
          const a = addrRows[0]
          if (a) {
            paqarAddress = {
              streetName:   a.street_name,
              streetNumber: a.street_number,
              floor:        a.floor ?? undefined,
              department:   a.department ?? undefined,
              cityName:     a.city_name,
              state:        a.state,
              zipCode:      a.zip_code,
              observation:  a.observation ?? undefined,
            }
          }
        }

        const paqarResult = await paqarCreateOrder({
          deliveryType:    order.delivery_type as 'homeDelivery' | 'agency' | 'locker',
          agencyId:        order.agency_id ?? undefined,
          receiverName:    order.buyer_name,
          receiverPhone:   order.buyer_phone,
          address:         paqarAddress,
          parcel: {
            weight: dims.weight_grams,
            height: dims.height_cm,
            width:  dims.width_cm,
            depth:  dims.depth_cm,
          },
          declaredValue:   order.total,
          referenceNumber: String(orderId),
        })

        // Guardar shipment exitoso
        await pool.query(
          `INSERT INTO shipments
             (online_order_id, business_id, correo_config_id, environment,
              delivery_type, agency_id, shipping_address_id,
              tracking_number, weight_grams, height_cm, width_cm, depth_cm,
              declared_value, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'created')`,
          [
            orderId, businessId,
            order.correo_config_id, order.environment ?? 'test',
            order.delivery_type, order.agency_id ?? null,
            order.shipping_address_id ?? null,
            paqarResult.trackingNumber,
            dims.weight_grams, dims.height_cm, dims.width_cm, dims.depth_cm,
            order.total,
          ]
        )

        await pool.query(
          `UPDATE online_orders SET status = 'preparing', updated_at = NOW() WHERE id = $1`,
          [orderId]
        )

        shipmentResult = { trackingNumber: paqarResult.trackingNumber }

        // Email de despacho al comprador (non-blocking)
        sendShipmentNotification(orderId, 'Correo Argentino', paqarResult.trackingNumber)
          .catch(e => console.error(`[confirm order ${orderId}] shipment email error:`, e))

      } catch (paqarErr) {
        // El envío falló — guardar error, pero la venta queda confirmada
        const errorDetail = String(paqarErr)
        console.error(`[confirm order ${orderId}] PAQ.AR error:`, errorDetail)

        await pool.query(
          `INSERT INTO shipments
             (online_order_id, business_id, correo_config_id, environment,
              delivery_type, agency_id, shipping_address_id,
              weight_grams, height_cm, width_cm, depth_cm,
              declared_value, status, error_detail)
           SELECT $1,$2,$3,$4,$5,$6,$7,
                  COALESCE(s.value::int, 500),
                  5, 30, 20,
                  $8,'error',$9
           FROM settings s WHERE s.key = 'shipping_default_weight_grams' AND s.business_id = $2
           LIMIT 1`,
          [
            orderId, businessId,
            order.correo_config_id, order.environment ?? 'test',
            order.delivery_type, order.agency_id ?? null,
            order.shipping_address_id ?? null,
            order.total, errorDetail,
          ]
        )

        shipmentResult = { error: errorDetail }
      }
    }

    return NextResponse.json({
      ok: true,
      saleId,
      shipment: shipmentResult,
    })

  } catch (err) {
    console.error('[PATCH /api/orders/online/:id/confirm]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
