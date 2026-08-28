import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJOrderDetail, getCJTrackingInfo } from '@/lib/cj'

/**
 * GET /api/orders/[id]/tracking
 *
 * Consulta el tracking de un pedido en CJ Dropshipping.
 * Si hay tracking nuevo, lo guarda en online_orders.
 *
 * Responde con:
 * {
 *   fulfillment_status: string
 *   cj_order_id:    string | null
 *   cj_tracking_no: string | null
 *   cj_tracking_url: string | null
 *   trackingInfo:   CJTrackingInfo | null
 * }
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { id } = await params
  const orderId = parseInt(id, 10)
  if (isNaN(orderId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const { rows } = await pool.query<{
    id:                 number
    cj_order_id:        string | null
    cj_tracking_no:     string | null
    cj_tracking_url:    string | null
    fulfillment_status: string | null
  }>(
    `SELECT id, cj_order_id, cj_tracking_no, cj_tracking_url, fulfillment_status
     FROM online_orders
     WHERE id = $1 AND business_id = $2`,
    [orderId, businessId],
  )

  if (!rows.length) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  }

  const order = rows[0]

  // Sin CJ order aún
  if (!order.cj_order_id) {
    return NextResponse.json({
      fulfillment_status: order.fulfillment_status ?? 'not_submitted',
      cj_order_id:        null,
      cj_tracking_no:     null,
      cj_tracking_url:    null,
      trackingInfo:       null,
    })
  }

  try {
    const token = await getCJTokenForBusiness(businessId)

    // Consultar estado de la orden en CJ
    const cjOrder = await getCJOrderDetail(token, order.cj_order_id)

    // Si hay número de tracking nuevo, guardarlo
    let trackingInfo = null
    if (cjOrder.trackNumber) {
      if (cjOrder.trackNumber !== order.cj_tracking_no) {
        await pool.query(
          `UPDATE online_orders
           SET cj_tracking_no  = $1,
               cj_tracking_url = $2,
               fulfillment_status = CASE
                 WHEN $3 = 'SHIPPED'   THEN 'shipped'
                 WHEN $3 = 'DELIVERED' THEN 'delivered'
                 ELSE fulfillment_status
               END,
               updated_at = NOW()
           WHERE id = $4`,
          [cjOrder.trackNumber, cjOrder.trackUrl, cjOrder.orderStatus, orderId],
        )
      }
      // Obtener eventos de tracking
      try {
        trackingInfo = await getCJTrackingInfo(token, cjOrder.trackNumber)
      } catch { /* tracking puede no estar disponible aún */ }
    }

    return NextResponse.json({
      fulfillment_status: cjOrder.orderStatus.toLowerCase(),
      cj_order_id:        cjOrder.orderId,
      cj_tracking_no:     cjOrder.trackNumber,
      cj_tracking_url:    cjOrder.trackUrl,
      trackingInfo,
    })

  } catch (err) {
    console.error(`[GET /api/orders/${orderId}/tracking]`, err)
    // Devuelve lo que tenemos en DB aunque CJ no responda
    return NextResponse.json({
      fulfillment_status: order.fulfillment_status,
      cj_order_id:        order.cj_order_id,
      cj_tracking_no:     order.cj_tracking_no,
      cj_tracking_url:    order.cj_tracking_url,
      trackingInfo:       null,
      error:              String(err),
    })
  }
}
