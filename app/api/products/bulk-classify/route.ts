import { NextResponse } from 'next/server'
import pool from '@/lib/db'

const ALLOWED_FIELDS = ['category_id', 'age_group_id', 'season_id', 'gender_id']

/**
 * POST /api/products/bulk-classify
 * Body: { ids: number[], field: string, value: number | null }
 *
 * Actualiza un campo de clasificación en múltiples productos a la vez.
 */
export async function POST(req: Request) {
  const { ids, field, value } = await req.json() as {
    ids:   number[]
    field: string
    value: number | null
  }

  if (!ids?.length)              return NextResponse.json({ error: 'ids requeridos' },   { status: 400 })
  if (!ALLOWED_FIELDS.includes(field)) return NextResponse.json({ error: 'Campo no permitido' }, { status: 400 })

  const { rowCount } = await pool.query(
    `UPDATE products
     SET ${field} = $1, updated_at = NOW()
     WHERE id = ANY($2::int[])`,
    [value ?? null, ids]
  )

  return NextResponse.json({ updated: rowCount })
}
