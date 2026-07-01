import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * PATCH /api/accounts/[id]
 * Body: { name?, type?, currency?, branch_id? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body   = await req.json() as Record<string, unknown>
  const aid    = parseInt(id)

  const allowed = ['name', 'type', 'currency', 'branch_id']
  const updates = Object.entries(body).filter(([k]) => allowed.includes(k))
  if (updates.length === 0)
    return NextResponse.json({ error: 'Sin campos' }, { status: 400 })

  const setClauses = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values      = updates.map(([, v]) => v)
  values.push(aid)

  try {
    const { rows } = await pool.query(
      `UPDATE accounts SET ${setClauses} WHERE id = $${values.length}
       RETURNING id, name, type, currency, branch_id`,
      values
    )
    if (rows.length === 0)
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[PATCH /api/accounts/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** DELETE /api/accounts/[id] — falla con mensaje claro si tiene fops o movimientos */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { rowCount } = await pool.query(`DELETE FROM accounts WHERE id = $1`, [parseInt(id)])
    if (rowCount === 0)
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const pgErr = err as { code?: string }
    if (pgErr.code === '23503') {
      return NextResponse.json(
        { error: 'No se puede eliminar: la cuenta tiene formas de pago o movimientos asociados' },
        { status: 409 }
      )
    }
    console.error('[DELETE /api/accounts/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
