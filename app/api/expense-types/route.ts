import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/** GET /api/expense-types — todos los tipos de gasto activos */
export async function GET() {
  const { rows } = await pool.query(
    `SELECT id, name, type, budget::float AS budget
     FROM expense_types
     WHERE active = true
     ORDER BY name`
  )
  return NextResponse.json(rows)
}

/**
 * POST /api/expense-types
 * Body: { name, type?, budget? }
 */
export async function POST(req: Request) {
  try {
    const { name, type = 'fijo', budget = 0 } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: 'name requerido' }, { status: 400 })
    if (!['fijo', 'variable'].includes(type))
      return NextResponse.json({ error: 'type debe ser fijo o variable' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO expense_types (name, type, budget, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (name) DO UPDATE SET active = true, type = $2, budget = $3
       RETURNING id, name, type, budget::float AS budget`,
      [name.trim(), type, Number(budget)]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
