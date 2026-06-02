import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  const { rows } = await pool.query(
    'SELECT id, name FROM seasons ORDER BY id'
  )
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

    const { rows } = await pool.query(
      'INSERT INTO seasons (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'Ya existe esa temporada' }, { status: 409 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
