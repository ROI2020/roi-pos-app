import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'
import { requireBusinessId } from '@/lib/get-business-id'

const VALID_ROLES = ['vendedor', 'encargado', 'administrador'] as const

/** GET /api/users — lista usuarios del negocio activo */
export async function GET(req: Request) {
  const bizResult = await requireBusinessId()
  if (bizResult instanceof NextResponse) return bizResult
  const { businessId } = bizResult

  const blocked = await requireFeature('users.manage', businessId)
  if (blocked) return blocked

  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all') === 'true'

  const { rows } = await pool.query(`
    SELECT id, name, email, role, active, created_at
    FROM app_users
    WHERE business_id = $1
    ${all ? '' : 'AND active = true'}
    ORDER BY name
  `, [businessId])
  return NextResponse.json(rows)
}

/**
 * POST /api/users
 * Body: { name, email, role }
 */
export async function POST(req: Request) {
  const bizResult = await requireBusinessId()
  if (bizResult instanceof NextResponse) return bizResult
  const { businessId } = bizResult

  const blocked = await requireFeature('users.manage', businessId)
  if (blocked) return blocked

  try {
    const { name, email, role } = await req.json()
    if (!name?.trim())  return NextResponse.json({ error: 'name requerido'  }, { status: 400 })
    if (!email?.trim()) return NextResponse.json({ error: 'email requerido' }, { status: 400 })
    if (!VALID_ROLES.includes(role))
      return NextResponse.json({ error: `role debe ser uno de: ${VALID_ROLES.join(', ')}` }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO app_users (name, email, role, business_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, active, created_at`,
      [name.trim(), email.trim().toLowerCase(), role, businessId]
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
