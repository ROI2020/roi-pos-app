import { NextResponse } from 'next/server'
import pool from '@/lib/db'

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

    values.push(parseInt(id))
    const { rows } = await pool.query(
      `UPDATE app_users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
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
  const { id } = await params
  await pool.query(`UPDATE app_users SET active = false WHERE id = $1`, [parseInt(id)])
  return NextResponse.json({ ok: true })
}
