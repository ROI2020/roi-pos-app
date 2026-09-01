import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { attemptCJFulfillment } from '@/lib/cj-fulfillment'

/**
 * POST /api/orders/online/:id/retry-fulfillment
 *
 * El admin reintenta el fulfillment CJ de un pedido que quedó sin enviar a CJ
 * (e.g. CJ estaba caído cuando el cliente pagó).
 *
 * Condiciones para que el retry proceda:
 *   - status = 'approved' | 'confirmed' | 'processing'
 *   - cj_order_id IS NULL  (no fue enviado aún)
 *
 * Requiere auth.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { id } = await params
  const orderId = parseInt(id)

  try {
    const { rows } = await pool.query<{
      id: number
      status: string
      cj_order_id: string | null
      fulfillment_status: string | null
    }>(
      `SELECT id, status, cj_order_id, fulfillment_status
       FROM online_orders
       WHERE id = $1 AND business_id = $2`,
      [orderId, businessId]
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    const order = rows[0]

    // Ya fue enviado a CJ — no hay nada que reintentar
    if (order.cj_order_id) {
      return NextResponse.json(
        { error: 'El pedido ya tiene una orden CJ asignada', cj_order_id: order.cj_order_id },
        { status: 409 }
      )
    }

    // Solo reintentamos para pedidos aprobados o en proceso (pago confirmado)
    const retryableStatuses = ['approved', 'confirmed', 'processing', 'preparing']
    if (!retryableStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: `El pedido está en estado '${order.status}' — no se puede reintentar el fulfillment` },
        { status: 422 }
      )
    }

    // Ejecutar el fulfillment (ya maneja su propio logging y error handling)
    const fulfilled = await attemptCJFulfillment(orderId)

    return NextResponse.json({ ok: true, fulfilled })

  } catch (err) {
    console.error('[POST /api/orders/online/:id/retry-fulfillment]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
