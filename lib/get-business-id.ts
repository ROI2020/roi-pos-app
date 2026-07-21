import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function getBusinessId(): Promise<number | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return null
  try {
    const session = JSON.parse(decodeURIComponent(raw)) as { business_id?: number }
    return session.business_id ?? null
  } catch {
    return null
  }
}

export async function requireBusinessId(): Promise<{ businessId: number } | NextResponse> {
  const id = await getBusinessId()
  if (!id) return NextResponse.json({ error: 'Sin negocio asociado' }, { status: 401 })
  return { businessId: id }
}
