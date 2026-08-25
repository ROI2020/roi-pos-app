import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { cancelOrder as paqarCancelOrder } from '@/lib/correo/correoArgentino'

/**
 * PATCH /api/orders/online/:id/cancel
 *
 * Cancela el pedido online.
 * Si tiene tracking_number → intenta cancelar en PAQ.AR primero.
 * Si PAQ.AR falla (ya impuesto), se cancela solo el pedido local con advertencia.
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
    // Verificar que el pedido existe y no está ya cancelado/entregado
    const { rows: orderRows } = await pool.query<{
      status: string; sale_id: number | null; tracking_number: string | null; shipment_id: number | null
    }>(
      `SELECT oo.status, oo.sale_id, sh.tracking_number, sh.id AS shipment_id
       FROM online_orders oo
       LEFT JOIN shipments sh ON sh.online_order_id = oo.id
       WHERE oo.id = $1 AND oo.business_id = $2`,
      [orderId, businessId]
    )

    if (!orderRows.length)
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const { status, sale_id, tracking_number, shipment_id } = orderRows[0]

    if (status === 'cancelled')
      return NextResponse.json({ error: 'El pedido ya está cancelado' }, { status: 409 })
    if (status === 'delivered')
      return NextResponse.json({ error: 'No se puede cancelar un pedido entregado' }, { status: 409 })

    let paqarCancelError: string | null = null

    // Intentar cancelar en PAQ.AR si hay tracking_number
    if (tracking_number) {
      try {
        await paqarCancelOrder(tracking_number)
        await pool.query(
          `UPDATE shipments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
          [shipment_id]
        )
      } catch (err) {
        paqarCancelError = String(err)
        console.warn(`[cancel order ${orderId}] PAQ.AR cancel failed:`, paqarCancelError)
        // No bloqueamos la cancelación local — puede que ya esté impuesto
        await pool.query(
          `UPDATE shipments SET error_detail = $1, updated_at = NOW() WHERE id = $2`,
          [`Cancel failed: ${paqarCancelError}`, shipment_id]
        )
      }
    }

    // Actualizar estado del pedido
    await pool.query(
      `UPDATE online_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [orderId]
    )

    // Nota: NO se revierte la sale si ya existía — eso requiere una devolución manual.
    // Si el pedido estaba 'pending' (sin sale), no hay nada que revertir en stock.

    return NextResponse.json({
      ok: true,
      warning: sale_id
        ? 'La venta asociada debe revertirse manualmente si corresponde'
        : null,
      paqarWarning: paqarCancelError
        ? `No se pudo cancelar en PAQ.AR: ${paqarCancelError}`
        : null,
    })
  } catch (err) {
    console.error('[PATCH /api/orders/online/:id/cancel]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
