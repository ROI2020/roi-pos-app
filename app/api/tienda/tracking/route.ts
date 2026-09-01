import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getCJTokenForBusiness, getCJOrderDetail, getCJTrackingInfo } from '@/lib/cj'
import { sendShipmentNotification } from '@/lib/email-order'

/**
 * GET /api/tienda/tracking?id=ORDER_ID&email=EMAIL
 *
 * Endpoint público (sin auth) para que el cliente final consulte
 * el estado de su pedido y los eventos de tracking.
 *
 * Verificación: el email debe coincidir con buyer_email del pedido
 * para que nadie pueda ver pedidos ajenos.
 *
 * Devuelve:
 * {
 *   orderId:            number
 *   status:             string          // awaiting_payment|pending|confirmed|shipped|delivered|cancelled
 *   fulfillmentStatus:  string | null   // pending|submitted|shipped|delivered
 *   carrier:            string | null   // nombre del carrier (sin mencionar CJ)
 *   trackingNumber:     string | null
 *   lastEvent:          string | null
 *   events:             { date, detail, country }[]
 *   createdAt:          string
 * }
 */
export async function GET(req: Request) {
  try {
    const host       = req.headers.get('host') ?? ''
    const businessId = await resolveBusinessFromHost(host)

    const url    = new URL(req.url)
    const id     = url.searchParams.get('id')
    const email  = url.searchParams.get('email')?.toLowerCase().trim()

    if (!id || !email) {
      return NextResponse.json({ error: 'id y email son requeridos' }, { status: 400 })
    }

    const orderId = parseInt(id, 10)
    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // Buscar el pedido verificando que el email coincida (anti-enumeration)
    const { rows } = await pool.query<{
      id:                 number
      status:             string
      fulfillment_status: string | null
      cj_order_id:        string | null
      cj_tracking_no:     string | null
      buyer_name:         string
      created_at:         string
    }>(
      `SELECT id, status, fulfillment_status, cj_order_id, cj_tracking_no, buyer_name, created_at
       FROM online_orders
       WHERE id = $1
         AND business_id = $2
         AND LOWER(buyer_email) = $3`,
      [orderId, businessId, email],
    )

    if (!rows.length) {
      // Mismo mensaje para orden no encontrada o email incorrecto (no revelar si existe)
      return NextResponse.json(
        { error: 'No encontramos un pedido con ese número y email.' },
        { status: 404 },
      )
    }

    const order = rows[0]

    // Sin orden CJ todavía → devolver solo estado del pedido
    if (!order.cj_order_id) {
      return NextResponse.json({
        orderId:           order.id,
        buyerName:         order.buyer_name,
        status:            order.status,
        fulfillmentStatus: order.fulfillment_status ?? 'pending',
        carrier:           null,
        trackingNumber:    null,
        lastEvent:         null,
        events:            [],
        createdAt:         order.created_at,
      })
    }

    // Consultar CJ en tiempo real para estado actualizado
    try {
      const token    = await getCJTokenForBusiness(businessId)
      const cjOrder  = await getCJOrderDetail(token, order.cj_order_id)

      // Guardar tracking si hay novedad (sin bloquear la respuesta)
      const isNewTracking = cjOrder.trackNumber && cjOrder.trackNumber !== order.cj_tracking_no
      if (isNewTracking) {
        pool.query(
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
        ).catch(() => { /* no-op */ })
      }

      // Eventos de tracking (solo si hay número de guía)
      let carrier:   string | null = null
      let lastEvent: string | null = null
      let events: { date: string; detail: string; country: string }[] = []

      if (cjOrder.trackNumber) {
        try {
          const info = await getCJTrackingInfo(token, cjOrder.trackNumber)
          // Devolver el nombre del carrier pero NO la URL de CJ
          carrier   = info.logisticName
          lastEvent = info.lastEvent
          events    = info.events.map(e => ({
            date:    e.trackingDate,
            detail:  e.trackingDetail,
            country: e.trackingCountry,
          }))
        } catch { /* tracking puede no estar disponible aún */ }

        // Email de envío si el tracking number es nuevo (primera vez que aparece)
        if (isNewTracking) {
          sendShipmentNotification(orderId, carrier, cjOrder.trackNumber).catch(() => {})
        }
      }

      // Normalizar status CJ → estado legible (sin exponer jerga CJ)
      const fulfillmentMap: Record<string, string> = {
        CREATED:       'processing',
        IN_PRODUCTION: 'processing',
        SHIPPED:       'shipped',
        DELIVERED:     'delivered',
        CANCELLED:     'cancelled',
      }

      return NextResponse.json({
        orderId:           order.id,
        buyerName:         order.buyer_name,
        status:            order.status,
        fulfillmentStatus: fulfillmentMap[cjOrder.orderStatus] ?? order.fulfillment_status ?? 'processing',
        carrier,
        trackingNumber:    cjOrder.trackNumber ?? null,
        lastEvent,
        events,
        createdAt:         order.created_at,
      })

    } catch (cjErr) {
      // CJ no responde — devolvemos lo que hay en DB
      console.warn('[tracking] CJ no disponible, usando DB:', String(cjErr).slice(0, 100))
      return NextResponse.json({
        orderId:           order.id,
        buyerName:         order.buyer_name,
        status:            order.status,
        fulfillmentStatus: order.fulfillment_status ?? 'processing',
        carrier:           null,
        trackingNumber:    order.cj_tracking_no,
        lastEvent:         null,
        events:            [],
        createdAt:         order.created_at,
      })
    }

  } catch (err) {
    console.error('[GET /api/tienda/tracking]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
