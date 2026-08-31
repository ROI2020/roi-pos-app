import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'

/**
 * GET /api/store-pages/[slug]
 *
 * Endpoint público — devuelve el contenido de una página de la tienda
 * (Shipping Policy, Terms of Service, etc.) filtrado por negocio y slug.
 * Solo devuelve páginas con is_published = true.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const host = req.headers.get('host') ?? ''
    const businessId = await resolveBusinessFromHost(host)

    const { rows } = await pool.query<{
      title: string; content: string; updated_at: string
    }>(
      `SELECT title, content, updated_at
       FROM store_pages
       WHERE business_id = $1
         AND slug        = $2
         AND is_published = true
       LIMIT 1`,
      [businessId, slug]
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[GET /api/store-pages]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
