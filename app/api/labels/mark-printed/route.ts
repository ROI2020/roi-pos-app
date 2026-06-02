import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * POST /api/labels/mark-printed
 * Body: { variant_ids: number[] }
 *
 * Marca `label_printed_at = NOW()` en los product_variants indicados.
 */
export async function POST(req: Request) {
  try {
    const { variant_ids } = await req.json()

    if (!Array.isArray(variant_ids) || variant_ids.length === 0)
      return NextResponse.json({ error: 'variant_ids no puede estar vacío' }, { status: 400 })

    const { rowCount } = await pool.query(
      `UPDATE product_variants
         SET label_printed_at = NOW()
       WHERE id = ANY($1::int[])`,
      [variant_ids]
    )

    return NextResponse.json({ marked: rowCount ?? 0 })
  } catch (err) {
    console.error('[POST /api/labels/mark-printed]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/labels/mark-printed
 * Body: { variant_ids: number[] }
 *
 * Borra la marca de impresión (pone label_printed_at = NULL).
 */
export async function DELETE(req: Request) {
  try {
    const { variant_ids } = await req.json()

    if (!Array.isArray(variant_ids) || variant_ids.length === 0)
      return NextResponse.json({ error: 'variant_ids no puede estar vacío' }, { status: 400 })

    const { rowCount } = await pool.query(
      `UPDATE product_variants
         SET label_printed_at = NULL
       WHERE id = ANY($1::int[])`,
      [variant_ids]
    )

    return NextResponse.json({ unmarked: rowCount ?? 0 })
  } catch (err) {
    console.error('[DELETE /api/labels/mark-printed]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
