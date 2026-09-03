import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { updateProduct, type ProductUpdateInput } from '@/lib/products'

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
    // El body viene en camelCase desde el frontend; mapeamos a ProductUpdateInput.
    // Campos desconocidos son ignorados por TypeScript — no llegan al DB.
    const raw = await req.json() as Record<string, unknown>

    const fields: ProductUpdateInput = {
      ...(raw.name                !== undefined && { name:                String(raw.name) }),
      ...(raw.long_name           !== undefined && { longName:            raw.long_name as string | null }),
      ...(raw.longName            !== undefined && { longName:            raw.longName as string | null }),
      ...(raw.description         !== undefined && { description:         raw.description as string | null }),
      ...(raw.base_price          !== undefined && { basePrice:           Number(raw.base_price) }),
      ...(raw.basePrice           !== undefined && { basePrice:           Number(raw.basePrice) }),
      ...(raw.cuotas              !== undefined && { cuotas:              Number(raw.cuotas) }),
      ...(raw.markup_pct          !== undefined && { markupPct:           raw.markup_pct as number | null }),
      ...(raw.markupPct           !== undefined && { markupPct:           raw.markupPct as number | null }),
      ...(raw.slug                !== undefined && { slug:                raw.slug as string | null }),
      ...(raw.category_id         !== undefined && { categoryId:          raw.category_id as number | null }),
      ...(raw.categoryId          !== undefined && { categoryId:          raw.categoryId as number | null }),
      ...(raw.age_group_id        !== undefined && { ageGroupId:          raw.age_group_id as number | null }),
      ...(raw.ageGroupId          !== undefined && { ageGroupId:          raw.ageGroupId as number | null }),
      ...(raw.season_id           !== undefined && { seasonId:            raw.season_id as number | null }),
      ...(raw.seasonId            !== undefined && { seasonId:            raw.seasonId as number | null }),
      ...(raw.gender_id           !== undefined && { genderId:            raw.gender_id as number | null }),
      ...(raw.genderId            !== undefined && { genderId:            raw.genderId as number | null }),
      ...(raw.photo_url           !== undefined && { photoUrl:            raw.photo_url as string | null }),
      ...(raw.photoUrl            !== undefined && { photoUrl:            raw.photoUrl as string | null }),
      ...(raw.exportable_web      !== undefined && { exportableWeb:       Boolean(raw.exportable_web) }),
      ...(raw.exportableWeb       !== undefined && { exportableWeb:       Boolean(raw.exportableWeb) }),
      ...(raw.exportable_whatsapp !== undefined && { exportableWhatsapp:  Boolean(raw.exportable_whatsapp) }),
      ...(raw.exportableWhatsapp  !== undefined && { exportableWhatsapp:  Boolean(raw.exportableWhatsapp) }),
      ...(raw.exportable_instagram!== undefined && { exportableInstagram: Boolean(raw.exportable_instagram) }),
      ...(raw.exportableInstagram !== undefined && { exportableInstagram: Boolean(raw.exportableInstagram) }),
      ...(raw.exportable_facebook !== undefined && { exportableFacebook:  Boolean(raw.exportable_facebook) }),
      ...(raw.exportableFacebook  !== undefined && { exportableFacebook:  Boolean(raw.exportableFacebook) }),
    }

    const result = await updateProduct(pool, parseInt(id), businessId, fields)
    if (!result)
      return NextResponse.json({ error: 'Producto no encontrado o sin campos válidos' }, { status: 404 })

    return NextResponse.json(result)
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
