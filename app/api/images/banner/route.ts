import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'

/**
 * GET /api/images/banner
 * Sirve el banner del catálogo (settings.catalog_banner) como imagen HTTP real.
 * Resuelve el negocio desde el header Host para devolver el banner correcto.
 */
export async function GET(req: Request) {
  const host       = req.headers.get('host') ?? ''
  const businessId = await resolveBusinessFromHost(host)

  const { rows } = await pool.query<{ value: string | null }>(
    `SELECT value FROM settings WHERE key = 'catalog_banner' AND business_id = $1 LIMIT 1`,
    [businessId],
  )

  const dataUrl = rows[0]?.value
  if (!dataUrl) return new NextResponse('Not found', { status: 404 })

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match)  return new NextResponse('Invalid image data', { status: 422 })

  const buffer = Buffer.from(match[2], 'base64')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':   match[1],
      'Cache-Control':  'public, max-age=3600, stale-while-revalidate=600',
      'Content-Length': String(buffer.length),
    },
  })
}
