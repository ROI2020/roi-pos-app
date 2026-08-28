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

/**
 * Resuelve el business_id a partir del header Host de la request.
 *
 * - localhost / 127.0.0.1 → DEV_BUSINESS_ID (env var, default 1)
 * - dominio de producción → consulta business_domains JOIN business_plan (status=active)
 *
 * Lanza si el dominio no está registrado o el plan no está activo.
 */
export async function resolveBusinessFromHost(host: string): Promise<number> {
  // Limpiar host: quitar www. y número de puerto (ej: "localhost:3001" → "localhost")
  const clean = host
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')

  // Desarrollo local → env var DEV_BUSINESS_ID
  if (clean === 'localhost' || clean === '127.0.0.1') {
    const devId = parseInt(process.env.DEV_BUSINESS_ID ?? '1', 10)
    return isNaN(devId) ? 1 : devId
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
