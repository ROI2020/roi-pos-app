import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/** PATCH /api/purchases/[id]  — actualiza el título de la compra */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }    = await params
  const { title } = await req.json()

  const { rows } = await pool.query(
    `UPDATE purchases SET title = $1 WHERE id = $2 RETURNING id, title`,
    [title?.trim() || null, parseInt(id)]
  )
  if (rows.length === 0)
    return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })

  return NextResponse.json(rows[0])
}
