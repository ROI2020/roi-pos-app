import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * PATCH /api/fops/[id]
 * Body: { use_for_sales? }
 * `name` no es editable: se usa como string literal en lib/transactions.ts
 * (PAYMENT_FOP_MAP), cash-flow/route.ts (pivot) y lib/payment-methods.ts —
 * renombrarlo rompe esas tres cosas en silencio. Solo se define al crear.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body   = await req.json() as Record<string, unknown>
  const fid    = parseInt(id)

  const allowed = ['use_for_sales']
  const updates = Object.entries(body).filter(([k]) => allowed.includes(k))
  if (updates.length === 0)
    return NextResponse.json({ error: 'Sin campos' }, { status: 400 })

  const setClauses = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values      = updates.map(([, v]) => v)
  values.push(fid)

  try {
    const { rows } = await pool.query(
      `UPDATE fops SET ${setClauses} WHERE id = $${values.length}
       RETURNING id, account_id, name, use_for_sales`,
      values
    )
    if (rows.length === 0)
      return NextResponse.json({ error: 'Forma de pago no encontrada' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[PATCH /api/fops/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** DELETE /api/fops/[id] — falla con mensaje claro si tiene movimientos asociados */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { rowCount } = await pool.query(`DELETE FROM fops WHERE id = $1`, [parseInt(id)])
    if (rowCount === 0)
      return NextResponse.json({ error: 'Forma de pago no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const pgErr = err as { code?: string }
    if (pgErr.code === '23503') {
      return NextResponse.json(
        { error: 'No se puede eliminar: la forma de pago tiene movimientos asociados' },
        { status: 409 }
      )
    }
    console.error('[DELETE /api/fops/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
