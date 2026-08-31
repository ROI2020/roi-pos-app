import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/admin/store-pages
 * Lista todas las páginas del negocio (incluyendo no publicadas).
 */
export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query<{
    id: number; slug: string; title: string
    is_published: boolean; updated_at: string
  }>(
    `SELECT id, slug, title, is_published, updated_at
     FROM store_pages
     WHERE business_id = $1
     ORDER BY slug`,
    [businessId]
  )
  return NextResponse.json(rows)
}

/**
 * PUT /api/admin/store-pages
 * Upsert de una página. Body: { slug, title, content, is_published? }
 */
export async function PUT(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { slug, title, content, is_published = true } = await req.json() as {
    slug: string; title: string; content: string; is_published?: boolean
  }

  if (!slug?.trim() || !title?.trim()) {
    return NextResponse.json({ error: 'slug y title son obligatorios' }, { status: 400 })
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO store_pages (business_id, slug, title, content, is_published, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (business_id, slug)
     DO UPDATE SET
       title        = EXCLUDED.title,
       content      = EXCLUDED.content,
       is_published = EXCLUDED.is_published,
       updated_at   = NOW()
     RETURNING id`,
    [businessId, slug.trim(), title.trim(), content ?? '', is_published]
  )

  return NextResponse.json({ ok: true, id: rows[0].id })
}

/**
 * DELETE /api/admin/store-pages?slug=shipping-policy
 */
export async function DELETE(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug requerido' }, { status: 400 })

  await pool.query(
    `DELETE FROM store_pages WHERE business_id = $1 AND slug = $2`,
    [businessId, slug]
  )
  return NextResponse.json({ ok: true })
}
