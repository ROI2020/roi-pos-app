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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await requireRoisolAdmin()
  if (blocked) return blocked

  const { id: businessId } = await params
  const { domain } = await req.json() as { domain: string }

  if (!domain?.trim()) return NextResponse.json({ error: 'Dominio requerido' }, { status: 400 })

  try {
    const { rows: [dominio] } = await pool.query<{ id: string; domain: string; is_primary: boolean }>(
      `INSERT INTO business_domains (business_id, domain, is_primary)
       VALUES ($1, $2, false)
       RETURNING id, domain, is_primary`,
      [businessId, domain.trim()]
    )
    return NextResponse.json({ dominio }, { status: 201 })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Ese dominio ya está registrado.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Error al agregar dominio' }, { status: 500 })
  }
}
