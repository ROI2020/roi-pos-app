import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/functionalities
// Lista todas las funcionalidades con info del plan mínimo requerido.
// Útil para la pantalla de administración de features.
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT
         f.id,
         f.name,
         f.function_code,
         f.category,
         f.description,
         f.min_plan_level,
         f.display_mode,
         f.is_active,
         p.name AS min_plan_name
       FROM functionalities f
       JOIN plans p ON p.level = f.min_plan_level
       ORDER BY f.category ASC, f.min_plan_level ASC, f.name ASC`
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[functionalities] GET error:', err)
    return NextResponse.json({ error: 'Error al obtener funcionalidades' }, { status: 500 })
  }
}
