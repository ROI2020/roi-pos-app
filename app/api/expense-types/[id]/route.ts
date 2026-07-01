import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * PATCH /api/expense-types/[id]
 * Body: { name?, type?, budget? }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name, type, budget } = body

    const sets: string[] = []
    const vals: unknown[] = []

    if (name !== undefined) { sets.push(`name = $${vals.length + 1}`);   vals.push(name.trim()) }
    if (type !== undefined) {
      if (!['fijo', 'variable'].includes(type))
        return NextResponse.json({ error: 'type debe ser fijo o variable' }, { status: 400 })
      sets.push(`type = $${vals.length + 1}`)
      vals.push(type)
    }
    if (budget !== undefined) { sets.push(`budget = $${vals.length + 1}`); vals.push(Number(budget)) }

    if (!sets.length)
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })

    vals.push(parseInt(id))
    const { rows } = await pool.query(
      `UPDATE expense_types SET ${sets.join(', ')}
       WHERE id = $${vals.length} AND active = true
       RETURNING id, name, type, budget::float AS budget`,
      vals
    )
    if (!rows.length)
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    return NextResponse.json(rows[0])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** DELETE /api/expense-types/[id] — soft delete */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rowCount } = await pool.query(
      `UPDATE expense_types SET active = false WHERE id = $1 AND active = true`,
      [parseInt(id)]
    )
    if (!rowCount)
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
