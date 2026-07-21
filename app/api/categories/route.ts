import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query(
    'SELECT id, name FROM categories WHERE business_id = $1 ORDER BY name',
    [businessId]
  )
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  try {
    const { name } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

    const { rows } = await pool.query(
      'INSERT INTO categories (name, business_id) VALUES ($1, $2) RETURNING id, name',
      [name.trim(), businessId]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'Ya existe esa categoría' }, { status: 409 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
