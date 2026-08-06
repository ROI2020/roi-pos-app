import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

export async function GET(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')?.trim() ?? ''
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const conditions: string[] = ['business_id = $1']
  const params: unknown[]    = [businessId]
  let p = 2

  if (q) {
    conditions.push(`(name ILIKE $${p} OR phone ILIKE $${p})`)
    params.push(`%${q}%`)
    p++
  }
  params.push(limit, offset)

  const { rows } = await pool.query(
    `SELECT id, name, phone,
            consent_policies, consent_news, consent_images, consented_at,
            verified, last_roulette_month,
            created_at, updated_at
     FROM customers
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    params
  )
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  try {
    const {
      name,
      phone,
      consent_policies = false,
      consent_news     = false,
      consent_images   = false,
    } = await req.json()

    if (!name?.trim())  return NextResponse.json({ error: 'Nombre requerido' },   { status: 400 })
    if (!phone?.trim()) return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO customers
         (business_id, name, phone, consent_policies, consent_news, consent_images, consented_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [businessId, name.trim(), phone.trim(), consent_policies, consent_news, consent_images]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'Ya existe un cliente con ese teléfono' }, { status: 409 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
