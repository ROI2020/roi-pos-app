/**
 * lib/tenant-api.ts — SERVER ONLY
 *
 * Resolución de tenant para rutas API públicas.
 *
 * El middleware omite los paths '/api/' (están en SKIP_PATHS), por lo que
 * /api/catalog y /api/checkout NO reciben el header x-business-id inyectado.
 * Este módulo resuelve el business_id consultando business_domains
 * directamente en la DB (sin HTTP round-trip, más eficiente que llamar
 * al endpoint /api/tenant/resolve).
 *
 * Uso en una API route pública:
 *
 *   const host = req.headers.get('host') ?? ''
 *   const businessId = await resolveBusinessFromHost(host)
 */

import pool from '@/lib/db'
import { isQa, isDev } from '@/lib/env'

/**
 * Resuelve el business_id a partir del header Host de la request.
 *
 * - localhost / 127.0.0.1 → DEV_BUSINESS_ID (env var, default 1)
 * - QA: cookie qa_business_id → QA_DEFAULT_BUSINESS_ID → error
 * - dominio de producción → consulta business_domains JOIN business_plan (status=active)
 *
 * Lanza si el dominio no está registrado o el plan no está activo.
 */
export async function resolveBusinessFromHost(host: string): Promise<number> {
  const clean = host
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')

  if (clean === 'localhost' || clean === '127.0.0.1') {
    if (isQa) {
      const qaId = await getQaBusinessIdFromCookie()
      if (qaId) return qaId
    }
    const devId = parseInt(process.env.DEV_BUSINESS_ID ?? '1', 10)
    return isNaN(devId) ? 1 : devId
  }

  if (isQa) {
    const qaId = await getQaBusinessIdFromCookie()
    if (qaId) return qaId
  }

  const { rows } = await pool.query<{ business_id: number }>(
    `SELECT bd.business_id
     FROM business_domains bd
     JOIN business_plan bp ON bp.business_id = bd.business_id
     WHERE bd.domain = $1
       AND bp.status = 'active'
     LIMIT 1`,
    [clean]
  )

  if (!rows[0]) {
    throw new Error(`Dominio no registrado o sin plan activo: ${clean}`)
  }

  return rows[0].business_id
}

async function getQaBusinessIdFromCookie(): Promise<number | null> {
  try {
    const { cookies } = await import('next/headers')
    const store = await cookies()
    const raw = store.get('qa_business_id')?.value
    if (raw) {
      const id = parseInt(raw, 10)
      if (!isNaN(id) && id > 0) {
        const valid = await validateQaBusiness(id)
        if (valid) return id
      }
    }
  } catch { /* middleware context — cookies() not available */ }

  const fallback = process.env.QA_DEFAULT_BUSINESS_ID
  if (fallback) {
    const id = parseInt(fallback, 10)
    if (!isNaN(id) && id > 0) return id
  }
  return null
}

async function validateQaBusiness(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT b.id FROM business b
     WHERE b.id = $1 AND b.active_subscription_id IS NOT NULL
     LIMIT 1`,
    [id]
  )
  return rows.length > 0
}
