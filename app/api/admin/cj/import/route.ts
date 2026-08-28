import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import type { CJProductDetail } from '@/lib/cj'

/**
 * POST /api/admin/cj/import
 *
 * Importa un producto de CJ Dropshipping al catálogo local.
 * Crea un products + product_variants con cj_pid / cj_vid.
 *
 * Body:
 * {
 *   product:  CJProductDetail   (tal cual viene de /api/admin/cj/product)
 *   categoryId?: number          (categoría local, opcional)
 *   markup?:  number             (% de markup sobre precio CJ, default 0)
 * }
 *
 * Responde con { productId } del producto local creado.
 */
export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    product:     CJProductDetail
    categoryId?: number
    markup?:     number
  }

  const { product, categoryId, markup = 0 } = body
  if (!product?.pid) {
    return NextResponse.json({ error: 'product.pid es requerido' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const basePrice = parseFloat(product.sellPrice) || 0
    const finalPrice = basePrice * (1 + markup / 100)

    // ── 1. Crear producto local ───────────────────────────────────────────────
    const { rows: [prod] } = await client.query<{ id: number }>(
      `INSERT INTO products
         (business_id, name, description, base_price, general_image_url,
          weight_grams, cj_pid, cj_last_sync, exportable_web)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), true)
       RETURNING id`,
      [
        businessId,
        product.productName.slice(0, 150),
        product.productDescription?.slice(0, 2000) ?? null,
        finalPrice.toFixed(2),
        product.productImages?.[0] ?? product.productImage ?? null,
        product.productWeight ? Math.round(parseFloat(product.productWeight)) : null,
        product.pid,
      ],
    )
    const productId = prod.id

    // Asignar categoría si se proporcionó
    if (categoryId) {
      // Verificar que la categoría pertenece al negocio
      const catQ = await client.query<{ id: number }>(
        `SELECT id FROM categories WHERE id = $1 AND business_id = $2`,
        [categoryId, businessId],
      )
      if (catQ.rows.length) {
        await client.query(
          `UPDATE products SET category_id = $1 WHERE id = $2`,
          [categoryId, productId],
        )
      }
    }

    // ── 2. Crear variantes ────────────────────────────────────────────────────
    for (const variant of product.variants) {
      const variantPrice = parseFloat(variant.variantSellPrice) || finalPrice
      const variantFinalPrice = variantPrice * (1 + markup / 100)

      // SKU: usar el de CJ o generar uno basado en el product id + index
      const sku = variant.variantSku || `CJ-${product.pid}-${variant.vid}`

      await client.query(
        `INSERT INTO product_variants
           (product_id, sku, color, size, specific_image_url, cj_vid)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sku) DO NOTHING`,
        [
          productId,
          sku.slice(0, 100),
          (variant.variantColor || 'Única').slice(0, 50),
          (variant.variantSize  || 'Única').slice(0, 50),
          variant.variantImage || null,
          variant.vid,
        ],
      )

      // Precio base del variant (si difiere del padre)
      if (Math.abs(variantFinalPrice - finalPrice) > 0.01) {
        await client.query(
          `UPDATE products SET base_price = $1 WHERE id = $2`,
          [variantFinalPrice.toFixed(2), productId],
        )
      }
    }

    // ── 3. Log ────────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO cj_sync_log (business_id, sync_type, product_id, status, detail)
       VALUES ($1, 'import', $2, 'ok', $3)`,
      [
        businessId,
        productId,
        JSON.stringify({
          cjPid:        product.pid,
          productName:  product.productName,
          variantCount: product.variants.length,
          markup,
        }),
      ],
    )

    await client.query('COMMIT')
    return NextResponse.json({ productId }, { status: 201 })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/admin/cj/import]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
