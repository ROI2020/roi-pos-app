import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/plans
// Lista todos los planes ordenados por nivel.
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, level, monthly_sales_limit,
              user_quantity, branch_quantity, price, last_update
       FROM plans
       ORDER BY level ASC`
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[plans] GET error:', err)
    return NextResponse.json({ error: 'Error al obtener planes' }, { status: 500 })
  }
}
