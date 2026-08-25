import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import crypto from 'crypto'

/**
 * GET /api/images/products/[id]
 *
 * Convierte el Base64 almacenado en products.photo_url a una respuesta HTTP
 * con el Content-Type correcto (image/jpeg, image/png, etc.).
 * Esto permite que Meta, TikTok y cualquier plataforma externa accedan
 * a las imágenes del catálogo como URLs públicas reales.
 *
 * Incluye ETag y Last-Modified para que Google (Merchant Center, Search)
 * detecte cuándo la imagen cambió y la re-indexe sin esperar el ciclo
 * de caché de 24 hs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { rows } = await pool.query<{ photo_url: string | null; updated_at: string | null }>(
    `SELECT photo_url, updated_at FROM products WHERE id = $1`,
    [id]
  )

  const photoUrl  = rows[0]?.photo_url
  const updatedAt = rows[0]?.updated_at
  if (!photoUrl) {
    return new NextResponse('Not found', { status: 404 })
  }

  // Detectar mime type desde el data URL: "data:image/jpeg;base64,..."
  const match = photoUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    return new NextResponse('Invalid image data', { status: 422 })
  }

  const mimeType = match[1]
  const buffer   = Buffer.from(match[2], 'base64')

  // ETag basado en hash del contenido — Google revalida sin re-descargar si no cambió
  const etag         = `"${crypto.createHash('md5').update(match[2]).digest('hex')}"`
  const lastModified = updatedAt ? new Date(updatedAt).toUTCString() : new Date().toUTCString()

  // Respuesta 304 si el cliente/crawler ya tiene la versión actual
  const ifNoneMatch = req.headers.get('if-none-match')
  if (ifNoneMatch === etag) {
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
