import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * PATCH /api/purchase-details/[id]
 * Body: { unit_cost: number }
 *
 * Actualiza el costo unitario de un purchase_detail y recalcula
 * el total de la compra padre (sum of unit_cost × quantity).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }       = await params
  const { unit_cost } = await req.json() as { unit_cost: number }

  if (typeof unit_cost !== 'number' || unit_cost < 0)
    return NextResponse.json({ error: 'unit_cost inválido' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Actualizar el costo en el detalle
    const { rows } = await client.query(
      `UPDATE purchase_details
       SET unit_cost = $1
       WHERE id = $2
       RETURNING id, purchase_id, product_id, unit_cost::float, quantity`,
      [unit_cost, parseInt(id)]
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Detalle no encontrado' }, { status: 404 })
    }

    // 2. Recalcular total_amount de la compra padre
    await client.query(
      `UPDATE purchases
       SET total_amount = (
         SELECT COALESCE(SUM(d.unit_cost * d.quantity), 0)
         FROM purchase_details d
         WHERE d.purchase_id = $1
       )
       WHERE id = $1`,
      [rows[0].purchase_id]
    )

    await client.query('COMMIT')
    return NextResponse.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /api/purchase-details/:id]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
