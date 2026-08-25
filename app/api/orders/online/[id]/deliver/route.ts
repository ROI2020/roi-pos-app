import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * PATCH /api/orders/online/:id/deliver
 *
 * Marca el pedido como entregado / retirado en tienda.
 * Solo aplica a pedidos en estado 'confirmed' o 'preparing'.
 */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { id } = await params

  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM online_orders WHERE id = $1 AND business_id = $2`,
    [id, businessId]
  )

  if (!rows.length)
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const { status } = rows[0]
  if (!['confirmed', 'preparing', 'shipped'].includes(status))
    return NextResponse.json(
      { error: `No se puede marcar como entregado un pedido en estado '${status}'` },
      { status: 409 }
    )

  await pool.query(
    `UPDATE online_orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
    [id]
  )

  return NextResponse.json({ ok: true })
}
