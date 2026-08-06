import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

const ALLOWED = [
  'name', 'summary', 'detail', 'discount_type', 'value', 'days_of_week',
  'category_id', 'age_group_id', 'season_id', 'gender_id',
  'start_date', 'end_date',
  'roulette_weight', 'roulette_daily_limit',
  'estimated_savings', 'active',
]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { id }  = await params
  const body    = await req.json() as Record<string, unknown>
  const updates = Object.entries(body).filter(([k]) => ALLOWED.includes(k))
  if (!updates.length)
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })

  const sets = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const vals = [...updates.map(([, v]) => (v === '' ? null : v)), id, businessId]

  const { rows } = await pool.query(
    `UPDATE promotions SET ${sets}
     WHERE id = $${vals.length - 1} AND business_id = $${vals.length}
     RETURNING *`,
    vals
  )
  if (!rows[0]) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { id } = await params
  // Soft check: don't delete if there are spins referencing this promotion
  const { rows: [usage] } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM roulette_spins WHERE promotion_id = $1`,
    [id]
  )
  if (usage.cnt > 0)
    return NextResponse.json(
      { error: 'No se puede eliminar: la promoción tiene historial de ruleta. Desactivala en su lugar.' },
      { status: 409 }
    )

  const { rowCount } = await pool.query(
    `DELETE FROM promotions WHERE id = $1 AND business_id = $2`,
    [id, businessId]
  )
  if (!rowCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
