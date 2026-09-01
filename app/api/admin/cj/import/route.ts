import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJFreight } from '@/lib/cj'
import type { CJProductDetail } from '@/lib/cj'

/**
 * Elimina etiquetas HTML y entidades comunes.
 * CJ envía descripciones como HTML con tablas — las guardamos como texto plano.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * POST /api/admin/cj/import
 *
 * Importa un producto de CJ Dropshipping al catálogo local.
 * Crea un products + product_variants con cj_pid / cj_vid.
 *
 * Body:
 * {
 *   product:  CJProductDetail   (tal cual viene de /api/admin/cj/product)
 *   categoryId?: number          (categoría local, opcional — si no se provee se intenta
 *                                  auto-asignar por categoryName del producto CJ)
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
    // cj_data: guardamos el JSON completo para preservar galería, atributos, etc.
    // general_image_url: primera imagen (fallback rápido sin necesitar cj_data)
    const { rows: [prod] } = await client.query<{ id: number }>(
      `INSERT INTO products
         (business_id, name, description, base_price, general_image_url,
          weight_grams, cj_pid, cj_last_sync, exportable_web,
          cj_data, cj_cost_usd, markup_pct, cuotas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), true, $8, $9, $10, 0)
       RETURNING id`,
      [
        businessId,
        product.productName.slice(0, 150),
        product.productDescription ? stripHtml(product.productDescription).slice(0, 2000) : null,
        finalPrice.toFixed(2),
        product.productImages?.[0] ?? product.productImage ?? null,
        product.productWeight ? Math.round(parseFloat(product.productWeight)) : null,
        product.pid,
        // cj_data: JSON completo (galería, shipping, atributos). Columna requerida (20260831).
        JSON.stringify(product),
        // cj_cost_usd: precio CJ sin markup — se usa en sync para recalcular base_price
        basePrice.toFixed(2),
        // markup_pct: porcentaje de markup guardado para que el sync pueda replicarlo
        markup,
      ],
    )
    const productId = prod.id

    // Asignar categoría: primero la provista por el admin; si no, auto-match por nombre CJ
    let resolvedCategoryId: number | null = categoryId ?? null

    if (!resolvedCategoryId && product.categoryName) {
      const cjCatName = product.categoryName.trim().slice(0, 100)
      const catMatch = await client.query<{ id: number }>(
        `SELECT id FROM categories WHERE business_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [businessId, cjCatName],
      )
      if (catMatch.rows.length) {
        resolvedCategoryId = catMatch.rows[0].id
      } else if (cjCatName) {
        // Crear categoría automáticamente con el nombre de CJ
        const newCat = await client.query<{ id: number }>(
          `INSERT INTO categories (business_id, name) VALUES ($1, $2) RETURNING id`,
          [businessId, cjCatName],
        )
        resolvedCategoryId = newCat.rows[0].id
      }
    }

    if (resolvedCategoryId) {
      // Verificar que la categoría pertenece al negocio (por si vino del body)
      const catQ = await client.query<{ id: number }>(
        `SELECT id FROM categories WHERE id = $1 AND business_id = $2`,
        [resolvedCategoryId, businessId],
      )
      if (catQ.rows.length) {
        await client.query(
          `UPDATE products SET category_id = $1 WHERE id = $2`,
          [resolvedCategoryId, productId],
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
          (variant.variantColor || '').slice(0, 50),  // '' = sin color diferenciado
          (variant.variantSize  || '').slice(0, 50),  // '' = sin talle diferenciado
          variant.variantImage || null,
          variant.vid,
        ],
      )
      // Nota: branch_inventory usa modelo "1 fila = 1 unidad física".
      // Para dropshipping CJ, el stock real lo maneja CJ; el checkout
      // acepta variantes con cj_pid sin branch_inventory (ver checkout/route.ts).

      // Precio base del variant (si difiere del padre)
      if (Math.abs(variantFinalPrice - finalPrice) > 0.01) {
        await client.query(
          `UPDATE products SET base_price = $1 WHERE id = $2`,
          [variantFinalPrice.toFixed(2), productId],
        )
      }
    }

    // ── 3. Freight options (async, no bloquea si falla) ───────────────────────
    // Obtiene las opciones de envío CJ para el primer variant y las persiste.
    // Rate limit de CJ: 1 req/seg — no reintentar en el mismo request.
    const firstVid = product.variants[0]?.vid
    if (firstVid) {
      try {
        const cjToken      = await getCJTokenForBusiness(businessId)
        const freightOpts  = await getCJFreight(cjToken, {
          vid:              firstVid,
          quantity:         1,
          startCountryCode: 'US',    // almacén origen (CJ US warehouse)
          endCountryCode:   'US',    // destino por defecto
        })
        if (freightOpts.length > 0) {
          const cheapest = freightOpts[0]   // ya ordenados ascendente por precio
          await client.query(
            `UPDATE products
             SET cj_freight_options = $1, cj_shipping_usd = $2
             WHERE id = $3`,
            [JSON.stringify(freightOpts), cheapest.freight, productId],
          )
        }
      } catch (freightErr) {
        // No falla el import si freight no se puede calcular (rate limit, etc.)
        console.warn('[import] freight sync omitido:', String(freightErr).slice(0, 120))
      }
    }

    // ── 4. Log ────────────────────────────────────────────────────────────────
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
    // Si el error es que cj_data no existe (migration pendiente), reintentar sin ese campo
    if (String(err).includes('cj_data') && String(err).includes('column')) {
      console.warn('[POST /api/admin/cj/import] cj_data no existe en DB — ejecutar 20260831_cj_data.sql')
      return NextResponse.json(
        { error: 'Migration pendiente: ejecutar db/migrations/20260831_cj_data.sql en Supabase' },
        { status: 500 }
      )
    }
    console.error('[POST /api/admin/cj/import]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
