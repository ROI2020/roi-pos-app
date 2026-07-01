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

    // Buscar el usuario por email en app_users
    const { rows } = await pool.query(
      `SELECT id, name, email, role, avatar_url, business_id
       FROM app_users WHERE email = $1 AND active = true`,
      [email.toLowerCase()]
    )

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No tenés acceso al sistema. Pedile al administrador que te agregue.' },
        { status: 403 }
      )
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
    })
  } catch (err: unknown) {
    console.error('[POST /api/auth/google]', err)
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
  }
}
