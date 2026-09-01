import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import type { CJFreightOption } from '@/app/tienda/_types'

/**
 * GET /api/tienda/freight?productIds=1,2,3
 *
 * Endpoint PÚBLICO — sin autenticación.
 * Devuelve las opciones de envío CJ más recientes desde la DB para
 * los productos indicados, sin llamar a la API de CJ.
 *
 * Usado por el checkout para refrescar freight options que podrían
 * estar desactualizadas en el localStorage del carrito.
 *
 * Responde:
 * { freight: { [productId: string]: CJFreightOption[] } }
 */
export async function GET(req: Request) {
  try {
    const host       = req.headers.get('host') ?? ''
    const businessId = await resolveBusinessFromHost(host)

    const url        = new URL(req.url)
    const raw        = url.searchParams.get('productIds') ?? ''
    const productIds = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)

    if (productIds.length === 0) {
      return NextResponse.json({ freight: {} })
    }

    // Limitar a 50 productos por llamada
    const ids = productIds.slice(0, 50)

    const { rows } = await pool.query<{
      id:                  number
      cj_freight_options:  string | null
    }>(
      `SELECT id, cj_freight_options
       FROM products
       WHERE id = ANY($1::int4[])
         AND business_id = $2
         AND cj_pid IS NOT NULL`,
      [ids, businessId],
    )

    const freight: Record<string, CJFreightOption[]> = {}
    for (const row of rows) {
      if (!row.cj_freight_options) continue
      try {
        const opts = JSON.parse(row.cj_freight_options) as CJFreightOption[]
        if (Array.isArray(opts) && opts.length > 0) {
          freight[String(row.id)] = opts
        }
      } catch {
        // JSON malformado — ignorar
      }
    }

    return NextResponse.json({ freight }, {
      headers: {
        // Cacheable por 5 minutos — balance entre freshness y performance
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    })

  } catch (err) {
    console.error('[GET /api/tienda/freight]', err)
    return NextResponse.json({ freight: {} }, { status: 500 })
  }
}
