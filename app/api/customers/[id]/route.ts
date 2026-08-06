import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

const ALLOWED = ['name', 'phone', 'consent_policies', 'consent_news', 'consent_images', 'verified', 'last_roulette_month']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { id } = await params
  const { rows } = await pool.query(
    `SELECT * FROM customers WHERE id = $1 AND business_id = $2`,
    [id, businessId]
  )
  if (!rows[0]) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

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
  const vals = [...updates.map(([, v]) => v), id, businessId]

  const { rows } = await pool.query(
    `UPDATE customers SET ${sets}, updated_at = NOW()
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
  const { rowCount } = await pool.query(
    `DELETE FROM customers WHERE id = $1 AND business_id = $2`,
    [id, businessId]
  )
  if (!rowCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
