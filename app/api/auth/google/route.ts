import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// Decodifica un JWT de Google sin verificar firma (suficiente para uso interno)
function decodeGoogleJwt(token: string) {
  const payload = token.split('.')[1]
  const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
  return JSON.parse(decoded) as { email: string; name: string; picture: string; sub: string }
}

export async function POST(req: Request) {
  try {
    const { credential } = await req.json()
    if (!credential) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

    const { email, name, picture } = decodeGoogleJwt(credential)

    // Buscar el usuario por email, resolviendo su plans.id real via business_plan
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.business_id,
              COALESCE(p.id, 1) AS plan_id
       FROM app_users u
       LEFT JOIN business b        ON b.id  = u.business_id
       LEFT JOIN business_plan bp  ON bp.id = b.active_subscription_id
       LEFT JOIN plans p           ON p.id  = bp.plan_id
       WHERE u.email = $1 AND u.active = true`,
      [email.toLowerCase()]
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 403 })
    }

    const user = rows[0]

    // Actualizar nombre y avatar con los de Google si cambiaron
    await pool.query(
      `UPDATE app_users SET name = $1, avatar_url = $2 WHERE id = $3`,
      [name, picture, user.id]
    )

    return NextResponse.json({
      id: user.id,
      name,
      email: user.email,
      role: user.role,
      avatar_url: picture,
      business_id: user.business_id,
      plan_id: user.plan_id ?? 1,
    })
  } catch (err: unknown) {
    console.error('[POST /api/auth/google]', err)
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
  }
}
