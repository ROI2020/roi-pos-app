import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJFreight } from '@/lib/cj'
import type { CJProductDetail } from '@/lib/cj'
import { upsertProduct } from '@/lib/products'

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
    product:    CJProductDetail
    categoryId?: number
    markup?:     number
    /** Nombre corto curado por el admin (por defecto: primeras 150 chars del nombre CJ) */
    name?:       string
    /** Nombre completo de CJ (por defecto: nombre CJ completo, max 300 chars) */
    long_name?:  string
  }

  const { product, categoryId, markup = 0, name: nameOverride, long_name: longNameOverride } = body
  if (!product?.pid) {
    return NextResponse.json({ error: 'product.pid es requerido' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const basePrice  = parseFloat(product.sellPrice) || 0
    const finalPrice = basePrice * (1 + markup / 100)

    // name: nombre curado por el admin (puede llegar en el body o se genera del nombre CJ)
    // long_name: nombre completo de CJ (siempre actualiza en re-import)
    const productName  = (nameOverride?.trim()     || product.productName).slice(0, 150)
    const productLong  = (longNameOverride?.trim()  || product.productName).slice(0, 300)

    // ── 1. Crear o actualizar producto local (via lib/products) ─────────────
    // upsertCJProduct maneja el ON CONFLICT idempotente.
    // name y slug NO se tocan en re-imports — el admin puede haberlos curado.
    const prod = await upsertProduct(client, {
      businessId,
      name:           productName,
      longName:       productLong,
      description:    product.productDescription
        ? stripHtml(product.productDescription).slice(0, 2000)
        : null,
      basePrice:      finalPrice,
      generalImageUrl: product.productImages?.[0] ?? product.productImage ?? null,
      weightGrams:    product.productWeight ? Math.round(parseFloat(product.productWeight)) : null,
      cjPid:          product.pid,
      cjData:         product,
      cjCostUsd:      basePrice,
      markupPct:      markup,
      exportableWeb:  true,
      cuotas:         0,
    })
    const productId = prod.id
    const isNew     = prod.created   // true = insert, false = update

    // Asignar categoría: primero la provista por el admin; si no, auto-match por nombre CJ
    let resolvedCategoryId: number | null = categoryId ?? null

    if (!resolvedCategoryId && product.categoryName) {
      // CJ devuelve rutas como "Bags & Shoes / Women's Bags / Totes"
      // Nos quedamos con el primer segmento (categoría raíz más representativa)
      const cjCatName = product.categoryName.split('/')[0].trim().slice(0, 100)
      const catMatch = await client.query<{ id: number }>(
        `SELECT id FROM categories WHERE business_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [businessId, cjCatName],
      )
      if (catMatch.rows.length) {
        resolvedCategoryId = catMatch.rows[0].id
      } else if (cjCatName) {
        // Crear categoría automáticamente con el nombre de CJ
        // long_name = nombre original CJ; name = igual al principio (admin puede curar después)
        const newCat = await client.query<{ id: number }>(
          `INSERT INTO categories (business_id, name, long_name) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [businessId, cjCatName, cjCatName],
        ).catch(() =>
          // Fallback si long_name no existe todavía
          client.query<{ id: number }>(
            `INSERT INTO categories (business_id, name) VALUES ($1, $2) RETURNING id`,
            [businessId, cjCatName],
          )
        )
        resolvedCategoryId = newCat.rows[0]?.id ?? null
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
          action:       isNew ? 'created' : 'updated',
        }),
      ],
    )

    await client.query('COMMIT')
    return NextResponse.json(
      { productId, action: isNew ? 'created' : 'updated' },
      { status: isNew ? 201 : 200 }
    )

  } catch (err) {
    await client.query('ROLLBACK')
    const errStr = String(err)

    // Columnas de migrations pendientes — reintentar sin el campo faltante
    if (errStr.includes('long_name') && errStr.includes('column')) {
      console.warn('[POST /api/admin/cj/import] long_name no existe — ejecutar 20260902_products_long_name.sql')
      // Reintento sin long_name
      const client2 = await pool.connect()
      try {
        await client2.query('BEGIN')
        const basePrice  = parseFloat(product.sellPrice) || 0
        const finalPrice = basePrice * (1 + markup / 100)
        const productName = (nameOverride?.trim() || product.productName).slice(0, 150)
        const { rows: [prod2] } = await client2.query<{ id: number; created: boolean }>(
          `INSERT INTO products
             (business_id, name, description, base_price, general_image_url,
              weight_grams, cj_pid, cj_last_sync, exportable_web,
              cj_data, cj_cost_usd, markup_pct, cuotas)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), true, $8, $9, $10, 0)
           ON CONFLICT (business_id, cj_pid) WHERE cj_pid IS NOT NULL
           DO UPDATE SET
             description       = EXCLUDED.description,
             base_price        = EXCLUDED.base_price,
             general_image_url = EXCLUDED.general_image_url,
             weight_grams      = EXCLUDED.weight_grams,
             cj_last_sync      = NOW(),
             cj_data           = EXCLUDED.cj_data,
             cj_cost_usd       = EXCLUDED.cj_cost_usd,
             markup_pct        = EXCLUDED.markup_pct
           RETURNING id, (xmax = 0) AS created`,
          [
            businessId, productName,
            product.productDescription ? stripHtml(product.productDescription).slice(0, 2000) : null,
            finalPrice.toFixed(2),
            product.productImages?.[0] ?? product.productImage ?? null,
            product.productWeight ? Math.round(parseFloat(product.productWeight)) : null,
            product.pid, JSON.stringify(product), basePrice.toFixed(2), markup,
          ],
        )
        for (const variant of product.variants) {
          const vp = parseFloat(variant.variantSellPrice) || finalPrice
          const vfp = vp * (1 + markup / 100)
          const sku = variant.variantSku || `CJ-${product.pid}-${variant.vid}`
          await client2.query(
            `INSERT INTO product_variants (product_id, sku, color, size, specific_image_url, cj_vid)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sku) DO NOTHING`,
            [prod2.id, sku.slice(0,100), (variant.variantColor||'').slice(0,50),
             (variant.variantSize||'').slice(0,50), variant.variantImage||null, variant.vid],
          )
        }
        await client2.query(
          `INSERT INTO cj_sync_log (business_id, sync_type, product_id, status, detail)
           VALUES ($1,'import',$2,'ok',$3)`,
          [businessId, prod2.id, JSON.stringify({ cjPid: product.pid, action: prod2.created ? 'created' : 'updated', note: 'fallback_no_long_name' })],
        )
        await client2.query('COMMIT')
        return NextResponse.json(
          { productId: prod2.id, action: prod2.created ? 'created' : 'updated', warning: 'long_name no disponible — ejecutar migración 20260902_products_long_name.sql' },
          { status: prod2.created ? 201 : 200 }
        )
      } catch (err2) {
        await client2.query('ROLLBACK')
        console.error('[POST /api/admin/cj/import] fallback sin long_name también falló:', err2)
        return NextResponse.json({ error: String(err2) }, { status: 500 })
      } finally {
        client2.release()
      }
    }

    // 42P10: no existe el índice único para ON CONFLICT
    if ((err as { code?: string }).code === '42P10') {
      console.warn('[POST /api/admin/cj/import] Índice único faltante — ejecutar 20260901_products_cj_pid_unique.sql')
      return NextResponse.json(
        { error: 'Migration pendiente: ejecutar db/migrations/20260901_products_cj_pid_unique.sql en Supabase (CREATE UNIQUE INDEX products_business_cj_pid_uidx)' },
        { status: 500 }
      )
    }

    if (errStr.includes('cj_data') && errStr.includes('column')) {
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
