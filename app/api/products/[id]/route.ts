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

/**
 * DELETE /api/products/[id]
 *
 * Dos modos según si el producto tuvo movimientos:
 *  • Sin ventas ni compras: borrado físico (DELETE). Limpia variantes y stock.
 *  • Con ventas/compras:    borrado suave — deshabilita todos los canales de exposición.
 *
 * Responde:
 *  { deleted: true }                         → borrado físico
 *  { deleted: false, soft: true, sales: n }  → ocultado de todos los canales
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireBusinessId()
    if (authResult instanceof NextResponse) return authResult
    const { businessId } = authResult

    const { id } = await params

    // Verificar que el producto pertenece al negocio
    const { rows: [product] } = await pool.query<{ id: number }>(
      'SELECT id FROM products WHERE id = $1 AND business_id = $2',
      [id, businessId]
    )
    if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

    // Contar ventas que referencian variantes de este producto
    const { rows: [{ sales }] } = await pool.query<{ sales: number }>(
      `SELECT COUNT(*)::int AS sales
       FROM sale_items si
       JOIN product_variants pv ON pv.id = si.variant_id
       WHERE pv.product_id = $1`,
      [id]
    )

    if (Number(sales) > 0) {
      // Tiene ventas → solo ocultamos de todos los canales
      await pool.query(
        `UPDATE products
         SET exportable_web       = false,
             exportable_whatsapp  = false,
             exportable_instagram = false,
             exportable_facebook  = false,
             updated_at           = NOW()
         WHERE id = $1`,
        [id]
      )
      return NextResponse.json({ deleted: false, soft: true, sales: Number(sales) })
    }

    // Sin ventas → borrado físico en orden FK
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // 1. Stock de sucursales (branch_inventory)
      await client.query(
        `DELETE FROM branch_inventory
         WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)`,
        [id]
      )
      // 2. Imágenes por color
      await client.query(
        `DELETE FROM product_variant_images WHERE product_id = $1`,
        [id]
      ).catch(() => {})  // tabla puede no existir en todas las instancias
      // 3. Variantes
      await client.query('DELETE FROM product_variants WHERE product_id = $1', [id])
      // 4. Producto
      await client.query('DELETE FROM products WHERE id = $1 AND business_id = $2', [id, businessId])
      await client.query('COMMIT')
      return NextResponse.json({ deleted: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[DELETE /api/products/:id]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
