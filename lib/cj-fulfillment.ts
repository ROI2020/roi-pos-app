/**
 * lib/cj-fulfillment.ts
 *
 * Lógica de auto-fulfillment CJ Dropshipping.
 * Llamado desde:
 *   - /api/paypal/capture-order  (pago PayPal aprobado)
 *   - /api/webhooks/mp           (pago MP aprobado)
 *
 * Flujo:
 *   1. Verifica que CJ esté habilitado y auto_fulfill=true para el negocio
 *   2. Carga los ítems del pedido con sus cj_vid
 *   3. Si todos los ítems tienen cj_vid → crea la orden en CJ
 *   4. Actualiza online_orders con cj_order_id y fulfillment_status='submitted'
 *   5. Registra en cj_sync_log
 *
 * Si algo falla, loguea y devuelve sin lanzar (no queremos romper el flujo
 * principal de pago por un error de fulfillment).
 */

import pool from '@/lib/db'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { getCJTokenForBusiness, createCJOrder, type CJCreateOrderParams } from '@/lib/cj'

interface OrderRow {
  id:             number
  business_id:    number
  buyer_name:     string
  buyer_phone:    string
  buyer_email:    string | null
  delivery_type:  string
  // dirección de envío (puede ser null si es retiro)
  street_name:    string | null
  street_number:  string | null
  floor:          string | null
  department:     string | null
  city_name:      string | null
  state:          string | null
  zip_code:       string | null
  country_code:   string | null
}

interface ItemRow {
  cj_vid:       string | null
  quantity:     number
  product_name: string
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  AR: 'Argentina',
}

/**
 * Intenta crear la orden en CJ para el pedido dado.
 * No lanza — los errores se loguean internamente.
 * Devuelve true si el fulfillment se envió correctamente.
 */
export async function attemptCJFulfillment(orderId: number): Promise<boolean> {
  try {
    // ── 1. Verificar que CJ esté habilitado + auto_fulfill ───────────────────
    const orderQ = await pool.query<OrderRow>(
      `SELECT
         o.id, o.business_id, o.buyer_name, o.buyer_phone, o.buyer_email,
         o.delivery_type,
         sa.street_name, sa.street_number, sa.floor, sa.department,
         sa.city_name, sa.state, sa.zip_code,
         COALESCE(sa.country_code, 'AR') AS country_code
       FROM online_orders o
       LEFT JOIN shipping_addresses sa ON sa.id = o.shipping_address_id
       WHERE o.id = $1`,
      [orderId],
    )

    if (!orderQ.rows.length) {
      console.warn(`[CJ fulfillment] Pedido #${orderId} no encontrado`)
      return false
    }

    const order = orderQ.rows[0]

    // Verificar settings de CJ para el negocio
    const pub = await getPublicSettingsByKeys(
      order.business_id,
      ['cj_enabled', 'cj_auto_fulfill'],
    )

    if (pub.cj_enabled !== 'true') {
      // CJ no está habilitado para este negocio — nada que hacer
      return false
    }

    if (pub.cj_auto_fulfill !== 'true') {
      // Auto-fulfill desactivado — admin debe hacerlo manualmente
      return false
    }

    // ── 2. Cargar ítems con cj_vid ────────────────────────────────────────────
    const itemsQ = await pool.query<ItemRow>(
      `SELECT
         pv.cj_vid,
         COALESCE(oi.quantity, 1) AS quantity,
         oi.product_name
       FROM online_order_items oi
       JOIN product_variants pv ON pv.id = oi.product_variant_id
       WHERE oi.online_order_id = $1`,
      [orderId],
    )

    if (!itemsQ.rows.length) {
      console.warn(`[CJ fulfillment] Pedido #${orderId} sin ítems`)
      return false
    }

    // Verificar que todos los ítems tengan cj_vid
    const missingCJVid = itemsQ.rows.filter(i => !i.cj_vid)
    if (missingCJVid.length > 0) {
      console.info(
        `[CJ fulfillment] Pedido #${orderId}: ${missingCJVid.length} ítem(s) sin cj_vid.`,
        missingCJVid.map(i => i.product_name),
      )
      await logCJSync({
        businessId: order.business_id,
        orderId,
        status:     'error',
        detail:     { reason: 'missing_cj_vid', items: missingCJVid.map(i => i.product_name) },
      })
      return false
    }

    // Agrupar por cj_vid (puede haber múltiples filas del mismo vid)
    const vidMap = new Map<string, number>()
    for (const item of itemsQ.rows) {
      const vid = item.cj_vid!
      vidMap.set(vid, (vidMap.get(vid) ?? 0) + item.quantity)
    }

    // ── 3. Construir dirección ────────────────────────────────────────────────
    const countryCode = order.country_code ?? 'AR'
    const countryName = COUNTRY_NAMES[countryCode] ?? countryCode

    // US: "123 Main Street" / AR: "Corrientes 1234"
    const streetParts = countryCode === 'US'
      ? [order.street_number, order.street_name]
      : [order.street_name, order.street_number]
    const streetAddress = streetParts.filter(Boolean).join(' ')

    const address2Parts = [order.floor, order.department].filter(Boolean)
    const streetAddress2 = address2Parts.length ? address2Parts.join(' ') : undefined

    const orderParams: CJCreateOrderParams = {
      orderNumber:         `ROI-${orderId}`,
      consigneeName:       order.buyer_name,
      consigneePhone:      order.buyer_phone,
      consigneeEmail:      order.buyer_email ?? undefined,
      shippingCountryCode: countryCode,
      shippingCountry:     countryName,
      shippingProvince:    order.state      ?? '',
      shippingCity:        order.city_name  ?? '',
      shippingAddress:     streetAddress,
      shippingAddress2:    streetAddress2,
      shippingZip:         order.zip_code   ?? '',
      products: Array.from(vidMap.entries()).map(([vid, quantity]) => ({
        vid,
        quantity,
      })),
    }

    // ── 4. Crear orden en CJ ─────────────────────────────────────────────────
    const token  = await getCJTokenForBusiness(order.business_id)
    const result = await createCJOrder(token, orderParams)

    // ── 5. Actualizar pedido ──────────────────────────────────────────────────
    await pool.query(
      `UPDATE online_orders
       SET cj_order_id        = $1,
           cj_order_num       = $2,
           fulfillment_status = 'submitted',
           updated_at         = NOW()
       WHERE id = $3`,
      [result.cjOrderId, result.cjOrderNum, orderId],
    )

    await logCJSync({
      businessId: order.business_id,
      orderId,
      status:     'ok',
      detail:     { cjOrderId: result.cjOrderId, cjOrderNum: result.cjOrderNum },
    })

    console.info(
      `[CJ fulfillment] Pedido #${orderId} enviado a CJ. Orden CJ: ${result.cjOrderNum}`,
    )
    return true

  } catch (err) {
    console.error(`[CJ fulfillment] Error en pedido #${orderId}:`, err)
    // Log el error sin bloquear el flujo principal
    try {
      // Intentamos obtener business_id desde el pedido para el log
      const bq = await pool.query<{ business_id: number }>(
        `SELECT business_id FROM online_orders WHERE id = $1`,
        [orderId],
      )
      if (bq.rows.length) {
        await logCJSync({
          businessId: bq.rows[0].business_id,
          orderId,
          status:     'error',
          detail:     { error: String(err) },
        })
      }
    } catch { /* noop */ }

    return false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logCJSync(p: {
  businessId: number
  orderId:    number
  status:     'ok' | 'error'
  detail:     object
}) {
  await pool.query(
    `INSERT INTO cj_sync_log (business_id, sync_type, order_id, status, detail)
     VALUES ($1, 'fulfill', $2, $3, $4)`,
    [p.businessId, p.orderId, p.status, JSON.stringify(p.detail)],
  )
}
