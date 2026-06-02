import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/images/products/[id]
 *
 * Convierte el Base64 almacenado en products.photo_url a una respuesta HTTP
 * con el Content-Type correcto (image/jpeg, image/png, etc.).
 * Esto permite que Meta, TikTok y cualquier plataforma externa accedan
 * a las imágenes del catálogo como URLs públicas reales.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { rows } = await pool.query<{ photo_url: string | null }>(
    `SELECT photo_url FROM products WHERE id = $1`,
    [id]
  )

  const photoUrl = rows[0]?.photo_url
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

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':  mimeType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      'Content-Length': String(buffer.length),
    },
  })
}
