import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

const ALLOWED = [
  'name', 'long_name', 'description', 'base_price', 'cuotas',
  'markup_pct',
  'category_id', 'age_group_id', 'season_id', 'gender_id',
  'photo_url',
  'exportable_whatsapp', 'exportable_instagram',
  'exportable_facebook', 'exportable_web',
]

/**
 * GET /api/products/[id]
 * Retorna el producto completo incluyendo cj_data (para modal de edición DS).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireBusinessId()
    if (authResult instanceof NextResponse) return authResult
    const { businessId } = authResult

    const { id } = await params
    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.long_name, p.description,
         p.base_price::float, p.cuotas, p.photo_url,
         p.cj_pid, p.cj_cost_usd::float, p.markup_pct,
         p.general_image_url, p.cj_data,
         p.exportable_whatsapp, p.exportable_instagram,
         p.exportable_facebook, p.exportable_web,
         p.category_id, p.age_group_id, p.season_id, p.gender_id
       FROM products p
       WHERE p.id = $1 AND p.business_id = $2`,
      [id, businessId]
    )
    if (rows.length === 0)
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[GET /api/products/:id]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * PATCH /api/products/[id]
 * Body: any subset of ALLOWED fields.
 * Acepta null para limpiar campos FK o photo_url.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireBusinessId()
    if (authResult instanceof NextResponse) return authResult
    const { businessId } = authResult

    const { id } = await params
    const body   = await req.json() as Record<string, unknown>

    const updates = Object.entries(body).filter(([k]) => ALLOWED.includes(k))
    if (updates.length === 0)
      return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })

    const setClauses = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ')
    const values     = updates.map(([, v]) => v ?? null)
    values.push(id)
    const idParamIdx = values.length
    values.push(businessId)
    const bizParamIdx = values.length

    const { rows } = await pool.query(
      `UPDATE products
       SET ${setClauses}, updated_at = NOW()
       WHERE id = $${idParamIdx} AND business_id = $${bizParamIdx}
       RETURNING
         id, name, description, base_price::float, cuotas, photo_url,
         exportable_whatsapp, exportable_instagram,
         exportable_facebook, exportable_web,
         category_id, age_group_id, season_id, gender_id`,
      values
    )

    if (rows.length === 0)
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[PATCH /api/products/:id]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
