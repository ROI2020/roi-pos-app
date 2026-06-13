import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/** GET /api/products/[id]/last-cost
 *  Devuelve el unit_cost de la última compra del producto, o null si nunca fue comprado.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { rows } = await pool.query<{ unit_cost: number }>(
    `SELECT pd.unit_cost
     FROM purchase_details pd
     WHERE pd.product_id = $1
     ORDER BY pd.id DESC
     LIMIT 1`,
    [id]
  )
  return NextResponse.json(rows[0] ?? null)
}
