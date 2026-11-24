import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: Request) {
  const internalKey = process.env.INTERNAL_API_KEY
  const requestKey  = req.headers.get('x-internal-key')
  if (!internalKey || !requestKey || requestKey !== internalKey) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')?.trim()
  if (!businessId) {
    return NextResponse.json({ error: 'Param requerido: businessId' }, { status: 400 })
  }

  try {
    const { rows } = await pool.query<{ business_id: number; business_name: string }>(
      `SELECT b.id   AS business_id,
              b.name AS business_name
       FROM business b
       WHERE b.id = $1 AND b.active_subscription_id IS NOT NULL
       LIMIT 1`,
      [businessId]
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })
    }

    const settingsRes = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings
       WHERE business_id = $1
         AND key IN ('locale', 'catalog_ga4_measurement_id')
         AND is_secret = false`,
      [businessId]
    )
    const settingsMap = Object.fromEntries(settingsRes.rows.map(r => [r.key, r.value]))
    const locale     = settingsMap['locale'] ?? 'es-AR'
    const store_path = locale.startsWith('en') ? '/store' : '/tienda'
    const ga4_id     = settingsMap['catalog_ga4_measurement_id'] ?? null

    return NextResponse.json({
      ...rows[0],
      locale,
      store_path,
      ga4_id,
    })
  } catch (err) {
    console.error('[GET /api/tenant/resolve-by-id]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
