import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { getTracking } from '@/lib/correo/correoArgentino'

/**
 * GET /api/orders/online/:id/tracking
 *
 * Historial de tracking desde PAQ.AR.
 * Actualiza last_tracking_event en la tabla shipments.
 *
 * Requiere auth.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { id } = await params

  try {
    const { rows } = await pool.query<{ id: number; tracking_number: string }>(
      `SELECT sh.id, sh.tracking_number
       FROM shipments sh
       JOIN online_orders oo ON oo.id = sh.online_order_id
       WHERE oo.id = $1 AND oo.business_id = $2
         AND sh.tracking_number IS NOT NULL`,
      [id, businessId]
    )

    if (!rows.length)
      return NextResponse.json({ error: 'No hay tracking para este pedido' }, { status: 404 })

    const { id: shipmentId, tracking_number } = rows[0]

    const events = await getTracking(tracking_number)

    // Actualizar el último evento en DB
    if (events.length > 0) {
      await pool.query(
        `UPDATE shipments
         SET last_tracking_event = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(events[events.length - 1]), shipmentId]
      )
    }

    return NextResponse.json({ trackingNumber: tracking_number, events })
  } catch (err) {
    console.error('[GET /api/orders/online/:id/tracking]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
