/**
 * POST /api/ml/items
 *
 * Publica un producto de ROIPOS en MercadoLibre.
 *
 * Modelos de publicación:
 *   FLAT FAMILY: un ítem ML por color+talle (sin variations[]).
 *     COLOR y SIZE como atributos raíz. family_name compartido.
 *     → Usado para categorías de indumentaria (error 374 con variations+family_name).
 *   STANDARD: un único ítem con SIZE en variations (sin colores).
 */

import { NextResponse }        from 'next/server'
import pool                    from '@/lib/db'
import { requireBusinessId }   from '@/lib/get-business-id'
import { uploadImage, createListing, type MLVariationParams } from '@/lib/ml-service'

interface ProductRow {
  id:          number
  name:        string
  description: string | null
  base_price:  number
  photo_url:   string | null
  category:    string | null
}

interface VariantRow {
  id:                 number
  color:              string | null
  size:               string | null
  sku:                string
  barcode:            string | null
  specific_image_url: string | null
  stock_count:        number
}

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    productId:        number
    categoryId:       string
    listingType:      'free' | 'bronze' | 'gold_special' | 'gold_pro'
    condition:        'new' | 'used'
    extraAttributes?: Array<{ id: string; value_id?: string; value_name: string }>
    sizeValueMap?:    Record<string, string>
    colorMap?:        Record<string, string>
    colorValueMap?:   Record<string, string>
  }

  const { productId, categoryId, listingType, condition, extraAttributes, sizeValueMap, colorMap, colorValueMap } = body

  if (!productId || !categoryId) {
    return NextResponse.json({ error: 'productId y categoryId son requeridos' }, { status: 400 })
  }

  try {
    // ── 0. Guía de talles para la categoría (flat family la necesita) ───────
    // Busca por categoría + gender del producto (del extraAttributes GENDER).
    // Si no hay coincidencia exacta por gender, intenta sin filtro de gender (fallback).
    const mlGender = extraAttributes?.find(a => a.id === 'GENDER')?.value_name ?? null
    const { rows: gridRows } = await pool.query<{
      grid_id: string
      row_map:  Record<string, string>
    }>(
      mlGender
        ? `SELECT grid_id, row_map FROM ml_size_grids
           WHERE business_id = $1 AND category_id = $2
             AND (gender = $3 OR gender ILIKE $3)
           LIMIT 1`
        : `SELECT grid_id, row_map FROM ml_size_grids
           WHERE business_id = $1 AND category_id = $2
           LIMIT 1`,
      mlGender ? [businessId, categoryId, mlGender] : [businessId, categoryId],
    )
    // sizeGrid puede ser null; ml-service lo omitirá y ML dirá 2610 si lo necesita
    const sizeGrid = gridRows[0]
      ? { gridId: gridRows[0].grid_id, rowMap: gridRows[0].row_map }
      : null

    // ── 1. Cargar producto ──────────────────────────────────────────────────
    const { rows: prodRows } = await pool.query<ProductRow>(
      `SELECT p.id, p.name, p.description, p.base_price::float,
              p.photo_url, c.name AS category
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.business_id = $2
       LIMIT 1`,
      [productId, businessId],
    )
    if (!prodRows.length) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }
    const prod = prodRows[0]

    // ── 2. Cargar variantes con stock ───────────────────────────────────────
    const { rows: variants } = await pool.query<VariantRow>(
      `SELECT pv.id, pv.color, pv.size, pv.sku, pv.barcode,
              pv.specific_image_url,
              COUNT(bi.id)::int AS stock_count
       FROM product_variants pv
       LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
       WHERE pv.product_id = $1
       GROUP BY pv.id
       HAVING COUNT(bi.id) > 0
       ORDER BY pv.color, pv.size`,
      [productId],
    )

    if (!variants.length) {
      return NextResponse.json(
        { error: 'El producto no tiene variantes con stock disponible' },
        { status: 400 },
      )
    }

    // ── 3. Subir imágenes a ML ─────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''

    const colorPictureMap: Record<string, string> = {}
    const pictureIds: string[] = []

    const { rows: colorImgs } = await pool.query<{ color: string; id: number }>(
      `SELECT color, id FROM product_images
       WHERE product_id = $1 AND color IS NOT NULL
       ORDER BY sort_order, id`,
      [productId],
    )
    for (const ci of colorImgs) {
      if (ci.color && !colorPictureMap[ci.color]) {
        try {
          const pid = await uploadImage(businessId, `${baseUrl}/api/images/product-images/${ci.id}`)
          colorPictureMap[ci.color] = pid
          if (!pictureIds.includes(pid)) pictureIds.push(pid)
        } catch (e) {
          console.warn(`[ml/items] No se pudo subir imagen de color ${ci.color}:`, e)
        }
      }
    }

    if (prod.photo_url) {
      try {
        const pid = await uploadImage(businessId, `${baseUrl}/api/images/products/${prod.id}`)
        pictureIds.unshift(pid)
      } catch (e) {
        console.warn('[ml/items] No se pudo subir imagen principal:', e)
      }
    }

    if (pictureIds.length === 0) {
      return NextResponse.json(
        { error: 'El producto no tiene imágenes. Subí al menos una foto antes de publicar en ML.' },
        { status: 400 },
      )
    }

    // ── 4. Publicar ────────────────────────────────────────────────────────
    //
    // FLAT FAMILY: un ítem ML por cada combo color+talle.
    // La categoría MLA109085 (y similares de indumentaria) exige family_name
    // (error 369 si falta) Y rechaza variations[] con family_name (error 374).
    // Solución: family_name obligatorio, sin variations[], COLOR+SIZE en attributes raíz.
    //
    // El título NO puede incluir color ni talle (ML rechaza "attribute stuffing"
    // cuando esos atributos ya están declarados en attributes[]).
    // Cada ítem lleva el mismo título = family_name, y se diferencia por atributos.
    //
    const uniqueColors = [...new Set(variants.map(v => v.color).filter(Boolean))] as string[]
    const mlItemIds:    string[] = []   // todos (incluye existentes omitidos)
    const newMlItemIds: string[] = []   // solo los recién publicados en esta llamada

    // Nombre base en Title Case — NO incluye color ni talle
    const familyTitle = prod.name
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
      .slice(0, 60)

    if (uniqueColors.length > 0) {
      // Hay colores → publicar un ítem por cada combo color+talle
      for (const ownColor of uniqueColors) {
        const colorVariants = variants.filter(v => v.color === ownColor)
        const mlColorName   = colorMap?.[ownColor] ?? ownColor
        const mlColorId     = colorValueMap?.[mlColorName] ?? undefined

        const colorPics: string[] = []
        if (colorPictureMap[ownColor]) colorPics.push(colorPictureMap[ownColor])
        pictureIds.forEach(pid => { if (!colorPics.includes(pid)) colorPics.push(pid) })
        const thisPictureIds = colorPics.length > 0 ? colorPics : pictureIds

        const colorAttribute = {
          id:         'COLOR',
          value_name: mlColorName,
          ...(mlColorId && { value_id: mlColorId }),
        }

        for (const variant of colorVariants) {
          // Saltar variantes ya publicadas en ML — evita duplicados al republicar
          const { rows: existing } = await pool.query(
            `SELECT ml_item_id FROM ml_items
             WHERE business_id = $1 AND product_variant_id = $2 LIMIT 1`,
            [businessId, variant.id],
          )
          if (existing.length) {
            console.info(`[ml/items] Variante ${variant.id} (${mlColorName} T${variant.size}) ya publicada como ${existing[0].ml_item_id} — se omite`)
            mlItemIds.push(existing[0].ml_item_id as string)
            continue
          }

          const singleSku: MLVariationParams[] = [{
            size:              variant.size   ?? undefined,
            sizeValueId:       variant.size   ? (sizeValueMap?.[variant.size] ?? undefined) : undefined,
            availableQuantity: variant.stock_count,
            price:             prod.base_price,
            sku:               variant.sku    || undefined,
            barcode:           variant.barcode ?? undefined,
            pictureId:         thisPictureIds[0],
          }]

          const listing = await createListing(businessId, {
            title:           familyTitle,    // Solo nombre, sin color ni talle
            familyName:      familyTitle,    // Agrupa todos los ítems de este producto
            colorAttribute,
            categoryId,
            currency:        'ARS',
            listingType,
            condition,
            basePrice:       prod.base_price,
            description:     prod.description ?? undefined,
            pictureIds:      thisPictureIds,
            variations:      singleSku,      // → createListing usa isFlatFamily: sin variations[]
            extraAttributes: extraAttributes ?? [],
            sizeGrid,
          })

          mlItemIds.push(listing.mlItemId)
          newMlItemIds.push(listing.mlItemId)
          console.info(`[ml/items] Publicado ${mlColorName} talle ${variant.size ?? '-'} → ${listing.mlItemId}`)

          await pool.query(
            `INSERT INTO ml_items
               (business_id, product_id, product_variant_id, ml_item_id, ml_status, last_sync_at)
             VALUES ($1, $2, $3, $4, 'active', NOW())
             ON CONFLICT (product_variant_id, business_id)
               WHERE product_variant_id IS NOT NULL
             DO UPDATE
               SET ml_item_id   = EXCLUDED.ml_item_id,
                   ml_status    = 'active',
                   last_sync_at = NOW()`,
            [businessId, productId, variant.id, listing.mlItemId],
          )
        }
      }
    } else {
      // Sin colores → un único ítem con SIZE en variations
      const sizeVariations: MLVariationParams[] = variants.map(v => ({
        size:              v.size   ?? undefined,
        sizeValueId:       v.size   ? (sizeValueMap?.[v.size] ?? undefined) : undefined,
        availableQuantity: v.stock_count,
        price:             prod.base_price,
        sku:               v.sku    || undefined,
        barcode:           v.barcode ?? undefined,
        pictureId:         pictureIds[0],
      }))

      const listing = await createListing(businessId, {
        title:           familyTitle,
        categoryId,
        currency:        'ARS',
        listingType,
        condition,
        basePrice:       prod.base_price,
        description:     prod.description ?? undefined,
        pictureIds,
        variations:      sizeVariations,
        extraAttributes: extraAttributes ?? [],
        sizeGrid,
      })

      mlItemIds.push(listing.mlItemId)

      for (const v of variants) {
        await pool.query(
          `INSERT INTO ml_items
             (business_id, product_id, product_variant_id, ml_item_id, ml_status, last_sync_at)
           VALUES ($1, $2, $3, $4, 'active', NOW())
           ON CONFLICT (product_variant_id, business_id) DO UPDATE
             SET ml_item_id   = EXCLUDED.ml_item_id,
                 ml_status    = 'active',
                 last_sync_at = NOW()`,
          [businessId, productId, v.id, listing.mlItemId],
        )
      }

      syncMLVariationIds(businessId, listing.mlItemId, variants.map(v => v.id))
        .catch(e => console.error('[ml/items] Error sincronizando variation ids:', e))
    }

    // mlItemId y permalink apuntan al primer ítem nuevo (para el toast de la UI)
    const firstNew  = newMlItemIds[0] ?? mlItemIds[0] ?? null
    const permalink = firstNew ? `https://articulo.mercadolibre.com.ar/${firstNew}` : null

    return NextResponse.json({
      ok:              true,
      mlItemId:        firstNew,        // compat con la UI (toast)
      permalink,                        // compat con la UI
      mlItemIds,                        // todos (existentes + nuevos)
      newMlItemIds,                     // solo los publicados en esta llamada
      newCount:        newMlItemIds.length,
      skippedCount:    mlItemIds.length - newMlItemIds.length,
      variantCount:    variants.length,
      model:           uniqueColors.length > 0 ? 'flat-family' : 'standard',
    })

  } catch (err) {
    console.error('[ml/items POST]', err)
    return NextResponse.json(
      { error: String(err).replace('Error: ', '') },
      { status: 500 },
    )
  }
}

async function syncMLVariationIds(
  businessId: number,
  mlItemId:   string,
  variantIds: number[],
): Promise<void> {
  const { getMLItem } = await import('@/lib/ml-service')
  const item = await getMLItem(businessId, mlItemId)
  if (!item.variations?.length) return

  for (let i = 0; i < Math.min(variantIds.length, item.variations.length); i++) {
    await pool.query(
      `UPDATE ml_items
       SET ml_variation_id = $1
       WHERE business_id = $2 AND ml_item_id = $3 AND product_variant_id = $4`,
      [item.variations[i].id, businessId, mlItemId, variantIds[i]],
    )
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url       = new URL(req.url)
  const productId = url.searchParams.get('productId')

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (mi.ml_item_id)
       mi.ml_item_id, mi.ml_status, mi.last_sync_at,
       p.id AS product_id, p.name AS product_name
     FROM ml_items mi
     JOIN products p ON p.id = mi.product_id
     WHERE mi.business_id = $1
       ${productId ? 'AND mi.product_id = $2' : ''}
     ORDER BY mi.ml_item_id, mi.last_sync_at DESC NULLS LAST`,
    productId ? [businessId, parseInt(productId)] : [businessId],
  )

  return NextResponse.json(rows)
}
