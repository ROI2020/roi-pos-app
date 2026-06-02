import { NextResponse } from 'next/server'
import pool from '@/lib/db'

const VALID_ROLES = ['vendedor', 'encargado', 'administrador'] as const

/** GET /api/users — lista todos los usuarios activos (y opcionalmente inactivos) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all') === 'true'

  const { rows } = await pool.query(`
    SELECT id, name, email, role, active, created_at
    FROM app_users
    ${all ? '' : 'WHERE active = true'}
    ORDER BY name
  `)
  return NextResponse.json(rows)
}

/**
 * POST /api/users
 * Body: { name, email, role }
 */
export async function POST(req: Request) {
  try {
    const { name, email, role } = await req.json()
    if (!name?.trim())  return NextResponse.json({ error: 'name requerido'  }, { status: 400 })
    if (!email?.trim()) return NextResponse.json({ error: 'email requerido' }, { status: 400 })
    if (!VALID_ROLES.includes(role))
      return NextResponse.json({ error: `role debe ser uno de: ${VALID_ROLES.join(', ')}` }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO app_users (name, email, role)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, active, created_at`,
      [name.trim(), email.trim().toLowerCase(), role]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? err)
    if (msg.includes('app_users_email_unique'))
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    console.error('[POST /api/users]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
