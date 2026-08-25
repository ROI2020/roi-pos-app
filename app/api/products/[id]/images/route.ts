import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/products/[id]/images
 * Lista las fotos de color del producto.
 *
 * POST /api/products/[id]/images
 * Sube o reemplaza la foto de un color específico.
 * Body: { color: string | null, photo_url: string }
 *   color = null → foto general (fallback)
 *   color = "Negro" → foto del color Negro
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params

  const { rows } = await pool.query<{
    id: number; color: string | null; sort_order: number; created_at: string
  }>(
    `SELECT id, color, sort_order, created_at
     FROM product_images
     WHERE product_id = $1
     ORDER BY sort_order, id`,
    [id]
  )

  return NextResponse.json(rows)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params
  const { color, photo_url }: { color: string | null; photo_url: string } = await req.json()

  if (!photo_url?.startsWith('data:')) {
    return NextResponse.json({ error: 'photo_url debe ser un data URL' }, { status: 400 })
  }

  // UPSERT: si ya existe foto para ese color la reemplaza
  const { rows } = await pool.query<{ id: number }>(
    color !== null
      ? `INSERT INTO product_images (product_id, color, photo_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, color) WHERE color IS NOT NULL
         DO UPDATE SET photo_url = EXCLUDED.photo_url, created_at = now()
         RETURNING id`
      : `INSERT INTO product_images (product_id, color, photo_url)
         VALUES ($1, NULL, $2)
         RETURNING id`,
    color !== null ? [id, color, photo_url] : [id, photo_url]
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
