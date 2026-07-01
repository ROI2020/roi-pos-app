import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// PATCH /api/functionalities/[id]
// Permite ajustar min_plan_level, display_mode o is_active de una feature.
// Es el único punto de configuración del sistema de planes — sin tocar código.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as {
      min_plan_level?: number
      display_mode?: 'hidden' | 'locked'
      is_active?: boolean
    }

    const allowed = ['min_plan_level', 'display_mode', 'is_active'] as const
    const setClauses: string[] = []
    const values: unknown[] = []

    for (const key of allowed) {
      if (body[key] !== undefined) {
        values.push(body[key])
        setClauses.push(`${key} = $${values.length}`)
      }
    }

    if (!setClauses.length) {
      return NextResponse.json(
        { error: 'Nada para actualizar. Campos válidos: min_plan_level, display_mode, is_active' },
        { status: 400 }
      )
    }

    // Validación de display_mode
    if (body.display_mode && !['hidden', 'locked'].includes(body.display_mode)) {
      return NextResponse.json(
        { error: 'display_mode debe ser "hidden" o "locked"' },
        { status: 400 }
      )
    }

    // Validación de min_plan_level (debe existir en plans)
    if (body.min_plan_level !== undefined) {
      const { rows } = await pool.query(
        'SELECT 1 FROM plans WHERE level = $1',
        [body.min_plan_level]
      )
      if (!rows.length) {
        return NextResponse.json(
          { error: `No existe un plan con level = ${body.min_plan_level}` },
          { status: 400 }
        )
      }
    }

    values.push(parseInt(id, 10))
    const { rows } = await pool.query(
      `UPDATE functionalities
       SET ${setClauses.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, name, function_code, category, min_plan_level, display_mode, is_active`,
      values
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'Funcionalidad no encontrada' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[functionalities] PATCH error:', err)
    return NextResponse.json({ error: 'Error al actualizar funcionalidad' }, { status: 500 })
  }
}
