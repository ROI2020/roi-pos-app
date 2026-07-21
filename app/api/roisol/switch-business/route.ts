import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return NextResponse.json({ error: 'No session' }, { status: 401 })

  let session: { id: number; role: string }
  try {
    session = JSON.parse(decodeURIComponent(raw))
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  if (session.role !== 'roisol_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { businessId } = await req.json() as { businessId: number }
  if (!businessId || typeof businessId !== 'number') {
    return NextResponse.json({ error: 'businessId requerido' }, { status: 400 })
  }

  // Verificar que el negocio existe
  const { rows: biz } = await pool.query(
    `SELECT id FROM business WHERE id = $1`, [businessId]
  )
  if (!biz.length) {
    return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })
  }

  // Actualizar business_id del usuario en la DB
  await pool.query(
    `UPDATE app_users SET business_id = $1 WHERE id = $2`,
    [businessId, session.id]
  )

  // Obtener datos completos del usuario con el nuevo plan
  const { rows } = await pool.query<{
    id: number; name: string; email: string; role: string
    avatar_url: string | null; business_id: number; plan_id: number
  }>(
    `SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.business_id,
            COALESCE(p.id, 1) AS plan_id
     FROM app_users u
     LEFT JOIN business b       ON b.id  = u.business_id
     LEFT JOIN business_plan bp ON bp.id = b.active_subscription_id
     LEFT JOIN plans p          ON p.id  = bp.plan_id
     WHERE u.id = $1`,
    [session.id]
  )

  if (!rows.length) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  return NextResponse.json(rows[0])
}
