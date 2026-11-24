import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isQa } from '@/lib/env'
import pool from '@/lib/db'

export async function getBusinessId(): Promise<number | null> {
  if (isQa) {
    const qaId = await getQaBusinessIdFromCookie()
    if (qaId) return qaId
  }

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

async function getQaBusinessIdFromCookie(): Promise<number | null> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get('qa_business_id')?.value
    if (!raw) return null
    const id = parseInt(raw, 10)
    if (isNaN(id) || id <= 0) return null
    const { rows } = await pool.query<{ id: number }>(
      `SELECT b.id FROM business b
       WHERE b.id = $1 AND b.active_subscription_id IS NOT NULL
       LIMIT 1`,
      [id]
    )
    return rows.length > 0 ? id : null
  } catch {
    return null
  }
}
