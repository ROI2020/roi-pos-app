import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/tenant/resolve?domain=malema.roisol.com.ar
 *
 * Resuelve un dominio al negocio (business) que le corresponde.
 * Solo llamable desde el middleware via header x-internal-key.
 *
 * Esta protección evita que terceros consulten el mapeo dominio → negocio.
 * La key nunca se loguea ni aparece en respuestas.
 */
export async function GET(req: Request) {
  // Verificar clave interna
  const internalKey = process.env.INTERNAL_API_KEY
  const requestKey  = req.headers.get('x-internal-key')

  if (!internalKey || !requestKey || requestKey !== internalKey) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain')?.trim().toLowerCase()

  if (!domain) {
    return NextResponse.json({ error: 'Param requerido: domain' }, { status: 400 })
  }

  try {
    const { rows } = await pool.query<{ business_id: string; business_name: string }>(
      `SELECT b.id   AS business_id,
              b.name AS business_name
       FROM business b
       JOIN business_domains bd ON bd.business_id = b.id
       WHERE bd.domain = $1
         AND b.active_subscription_id IS NOT NULL
       LIMIT 1`,
      [domain]
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Obtener settings del negocio: locale + GA4 measurement ID
    const settingsRes = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings
       WHERE business_id = $1
         AND key IN ('locale', 'catalog_ga4_measurement_id')
         AND is_secret = false`,
      [rows[0].business_id]
    )
    const settingsMap  = Object.fromEntries(settingsRes.rows.map(r => [r.key, r.value]))
    const locale       = settingsMap['locale'] ?? 'es-AR'
    const store_path   = locale.startsWith('en') ? '/store' : '/tienda'
    const ga4_id       = settingsMap['catalog_ga4_measurement_id'] ?? null

    // Cache-Control: el edge puede cachear esta respuesta 5 minutos
    return NextResponse.json({ ...rows[0], locale, store_path, ga4_id }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
    })
  } catch (err) {
    console.error('[GET /api/tenant/resolve]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
