import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/** GET /api/expense-types — tipos de gasto activos */
export async function GET() {
  const { rows } = await pool.query(
    `SELECT id, name FROM expense_types WHERE active = true ORDER BY name`
  )
  return NextResponse.json(rows)
}

/**
 * POST /api/expense-types
 * Body: { name }
 * Crea o reactiva un tipo de gasto.
 */
export async function POST(req: Request) {
  try {
    const { name } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: 'name requerido' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO expense_types (name, active)
       VALUES ($1, true)
       ON CONFLICT (name) DO UPDATE SET active = true
       RETURNING id, name`,
      [name.trim()]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
