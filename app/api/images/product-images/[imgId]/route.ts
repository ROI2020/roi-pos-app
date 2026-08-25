import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import crypto from 'crypto'

/**
 * GET /api/images/product-images/[imgId]
 *
 * Sirve la foto de color de un producto almacenada en product_images.
 * Mismo patrón que /api/images/products/[id] — base64 → binary.
 * Incluye ETag para que Google y CDNs detecten cambios eficientemente.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ imgId: string }> }
) {
  const { imgId } = await params

  const { rows } = await pool.query<{ photo_url: string | null; created_at: string }>(
    `SELECT photo_url, created_at FROM product_images WHERE id = $1`,
    [imgId]
  )

  const photoUrl  = rows[0]?.photo_url
  const createdAt = rows[0]?.created_at
  if (!photoUrl) {
    return new NextResponse('Not found', { status: 404 })
  }

  const match = photoUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    return new NextResponse('Invalid image data', { status: 422 })
  }

  const mimeType     = match[1]
  const buffer       = Buffer.from(match[2], 'base64')
  const etag         = `"${crypto.createHash('md5').update(match[2]).digest('hex')}"`
  const lastModified = createdAt ? new Date(createdAt).toUTCString() : new Date().toUTCString()

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304 })
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':   mimeType,
      'Cache-Control':  'public, max-age=86400, stale-while-revalidate=3600',
      'Content-Length': String(buffer.length),
      'ETag':           etag,
      'Last-Modified':  lastModified,
    },
  })
}
