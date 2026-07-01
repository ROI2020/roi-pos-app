import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/** POST /api/fops — crea una nueva forma de pago dentro de una cuenta */
export async function POST(req: Request) {
  try {
    const { account_id, name, use_for_sales } = await req.json()

    if (!account_id)
      return NextResponse.json({ error: 'La cuenta es obligatoria' }, { status: 400 })
    if (!name?.trim())
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO fops (account_id, name, use_for_sales)
       VALUES ($1, $2, $3)
       RETURNING id, account_id, name, use_for_sales`,
      [parseInt(account_id), name.trim(), use_for_sales ?? true]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    console.error('[POST /api/fops]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
