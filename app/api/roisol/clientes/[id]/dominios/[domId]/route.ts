import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'

async function requireRoisolAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const { role } = JSON.parse(decodeURIComponent(raw)) as { role: string }
    if (role !== 'roisol_admin') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; domId: string }> }
) {
  const blocked = await requireRoisolAdmin()
  if (blocked) return blocked

  const { id: businessId, domId } = await params

  // No permitir eliminar el dominio primario desde aquí
  const { rows } = await pool.query(
    `SELECT is_primary FROM business_domains WHERE id = $1 AND business_id = $2`,
    [domId, businessId]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Dominio no encontrado' }, { status: 404 })
  if (rows[0].is_primary) return NextResponse.json({ error: 'No se puede eliminar el dominio primario' }, { status: 400 })

  await pool.query(`DELETE FROM business_domains WHERE id = $1`, [domId])
  return new NextResponse(null, { status: 204 })
}
