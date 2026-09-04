/**
 * POST /api/ml/items
 *
 * Publica un producto de ROIPOS en MercadoLibre.
 *
 * Body:
 * {
 *   productId:   number    — ID del producto en ROIPOS
 *   categoryId:  string    — ID de categoría ML (ej: "MLA109027")
 *   listingType: string    — "free" | "bronze" | "gold_special" | "gold_pro"
 *   condition:   string    — "new" | "used"
 * }
 *
 * Flujo:
 *   1. Carga el producto + variantes + imágenes de ROIPOS
 *   2. Sube las imágenes al CDN de ML
 *   3. Crea la publicación con todas las variantes
 *   4. Guarda el vínculo en ml_items
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
  specific_image_url: string | null
  stock_count:        number
}

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    productId:   number
    categoryId:  string
    listingType: 'free' | 'bronze' | 'gold_special' | 'gold_pro'
    condition:   'new' | 'used'
  }

  const { productId, categoryId, listingType, condition } = body

  if (!productId || !categoryId) {
    return NextResponse.json({ error: 'productId y categoryId son requeridos' }, { status: 400 })
  }

  try {
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
      `SELECT pv.id, pv.color, pv.size, pv.sku,
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
    // Imagen principal del producto
    const baseUrl   = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
    const mainImageUrl = prod.photo_url
      ? `${baseUrl}/api/images/products/${prod.id}`
      : null

    const pictureIds: string[] = []
    if (mainImageUrl) {
      try {
        const pid = await uploadImage(businessId, mainImageUrl)
        pictureIds.push(pid)
      } catch (e) {
        console.warn('[ml/items] No se pudo subir la imagen principal:', e)
      }
    }

    // Mapa color → picture_id (para asignar a cada variante)
    const colorPictureMap: Record<string, string> = {}
    const { rows: colorImgs } = await pool.query<{ color: string; id: number }>(
      `SELECT color, id FROM product_images
       WHERE product_id = $1 AND color IS NOT NULL
       ORDER BY sort_order, id`,
      [productId],
    )
    for (const ci of colorImgs) {
      if (ci.color && !colorPictureMap[ci.color]) {
        try {
          const imgUrl = `${baseUrl}/api/images/product-images/${ci.id}`
          const pid    = await uploadImage(businessId, imgUrl)
          colorPictureMap[ci.color] = pid
          if (!pictureIds.includes(pid)) pictureIds.push(pid)
        } catch (e) {
          console.warn(`[ml/items] No se pudo subir imagen de color ${ci.color}:`, e)
        }
      }
    }

    // ── 4. Construir variantes ML ──────────────────────────────────────────
    const mlVariations: MLVariationParams[] = variants.map(v => ({
      color:             v.color  ?? undefined,
      size:              v.size   ?? undefined,
      availableQuantity: v.stock_count,
      price:             prod.base_price,
      sku:               v.sku,
      pictureId:         v.color ? colorPictureMap[v.color] : pictureIds[0],
    }))

    // ── 5. Crear publicación en ML ─────────────────────────────────────────
    const listing = await createListing(businessId, {
      title:       prod.name,
      categoryId,
      currency:    'ARS',
      listingType,
      condition,
      basePrice:   prod.base_price,
      description: prod.description ?? undefined,
      pictureIds,
      variations:  mlVariations,
    })

    // ── 6. Guardar vínculo en ml_items ─────────────────────────────────────
    // Una fila por variante (para poder actualizar stock individualmente)
    // Necesitamos el mlVariationId de cada variante — lo obtenemos de la respuesta
    // de ML (GET /items/{id}) ya que createListing no devuelve los IDs de variantes
    // Para el primer insert guardamos solo el mlItemId, los ml_variation_id se
    // actualizan con syncMLVariationIds (se puede llamar después)
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

    // ── Actualizar ml_variation_id ─────────────────────────────────────────
    // Los IDs de variantes de ML están disponibles consultando el ítem recién creado.
    // Lo hacemos en background para no demorar la respuesta.
    syncMLVariationIds(businessId, listing.mlItemId, variants.map(v => v.id))
      .catch(e => console.error('[ml/items] Error sincronizando variation ids:', e))

    return NextResponse.json({
      ok:          true,
      mlItemId:    listing.mlItemId,
      permalink:   listing.permalink,
      variantCount: variants.length,
    })

  } catch (err) {
    console.error('[ml/items POST]', err)
    return NextResponse.json(
      { error: String(err).replace('Error: ', '') },
      { status: 500 },
    )
  }
}

/**
 * Consulta el ítem recién creado en ML y actualiza los ml_variation_id
 * en la tabla ml_items para cada variante.
 */
async function syncMLVariationIds(
  businessId: number,
  mlItemId:   string,
  variantIds: number[],
): Promise<void> {
  const { getMLItem } = await import('@/lib/ml-service')
  const item = await getMLItem(businessId, mlItemId)
  if (!item.variations?.length) return

  // Asociamos por posición: el orden de variantes en ML debería coincidir
  // con el orden en que las mandamos (color + size). Guardamos el ml_variation_id.
  for (let i = 0; i < Math.min(variantIds.length, item.variations.length); i++) {
    await pool.query(
      `UPDATE ml_items
       SET ml_variation_id = $1
       WHERE business_id = $2 AND ml_item_id = $3 AND product_variant_id = $4`,
      [item.variations[i].id, businessId, mlItemId, variantIds[i]],
    )
  }
}

// ── GET — listar productos ya publicados en ML ────────────────────────────────

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
