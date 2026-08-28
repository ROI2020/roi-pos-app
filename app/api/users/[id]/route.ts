import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'
import { requireBusinessId } from '@/lib/get-business-id'

const VALID_ROLES = ['vendedor', 'encargado', 'administrador']
const EDITABLE    = ['name', 'email', 'role', 'active']

/**
 * PATCH /api/users/[id]
 * Body: subset of { name, email, role, active }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bizResult = await requireBusinessId()
  if (bizResult instanceof NextResponse) return bizResult
  const { businessId } = bizResult

  const blocked = await requireFeature('users.manage', businessId)
  if (blocked) return blocked

  try {
    const { id } = await params
    const body   = await req.json() as Record<string, unknown>

    if (body.role && !VALID_ROLES.includes(body.role as string))
      return NextResponse.json({ error: 'role inválido' }, { status: 400 })

    const fields: string[] = []
    const values: unknown[] = []
    let i = 1
    for (const [k, v] of Object.entries(body)) {
      if (EDITABLE.includes(k)) { fields.push(`${k} = $${i++}`); values.push(v) }
    }
    if (fields.length === 0)
      return NextResponse.json({ error: 'Sin campos válidos para actualizar' }, { status: 400 })

    // Filtrar por business_id además de id — evita editar usuarios de otro tenant
    values.push(parseInt(id), businessId)
    const { rows } = await pool.query(
      `UPDATE app_users SET ${fields.join(', ')}
       WHERE id = $${i} AND business_id = $${i + 1}
       RETURNING *`,
      values
    )
    if (rows.length === 0)
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    return NextResponse.json(rows[0])
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? err)
    if (msg.includes('app_users_email_unique'))
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/users/[id]
 * Desactiva el usuario (soft-delete).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bizResult = await requireBusinessId()
  if (bizResult instanceof NextResponse) return bizResult
  const { businessId } = bizResult

  const blocked = await requireFeature('users.manage', businessId)
  if (blocked) return blocked

  const { id } = await params
  // Filtrar por business_id — evita desactivar usuarios de otro tenant
  await pool.query(
    `UPDATE app_users SET active = false WHERE id = $1 AND business_id = $2`,
    [parseInt(id), businessId]
  )
  return NextResponse.json({ ok: true })
}
