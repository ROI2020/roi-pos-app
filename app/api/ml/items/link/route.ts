/**
 * POST /api/ml/items/link
 *
 * Vincula publicaciones existentes de ML con un producto de ROIPOS.
 * Flujo inverso al de POST /api/ml/items (que publica desde ROIPOS → ML).
 *
 * Recibe:
 *   { productId, mlItemId }
 *
 * Pasos:
 *   1. Lee el ítem ML para obtener family_name, SIZE y COLOR.
 *   2. Busca todos los ítems del vendedor con ese family_name en la misma categoría.
 *   3. Para cada ítem, lee sus atributos (SIZE + COLOR) y busca la variante
 *      de ROIPOS que coincide (por color ILIKE + size).
 *   4. Inserta en ml_items los vínculos encontrados.
 *   5. Devuelve un resumen: vinculados y los que no encontraron variante.
 */

import { NextResponse }      from 'next/server'
import pool                  from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { mlFetch }           from '@/lib/ml-service'

interface MLAttr {
  id:         string
  value_name: string | null
}

interface MLItemFull {
  id:          string
  title:       string
  category_id: string
  family_name?: string
  status:      string
  attributes:  MLAttr[]
}

interface ProductVariantRow {
  id:    number
  color: string | null
  size:  string | null
}

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as { productId: number; mlItemId: string }
  const { productId, mlItemId } = body

  if (!productId || !mlItemId) {
    return NextResponse.json({ error: 'productId y mlItemId son requeridos' }, { status: 400 })
  }

  // ── 1. Leer el ítem ML de referencia ─────────────────────────────────────────
  let refItem: MLItemFull
  try {
    refItem = await mlFetch<MLItemFull>(businessId, `/items/${mlItemId}?include_attributes=all`)
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer ${mlItemId}: ${String(e).slice(0, 200)}` }, { status: 400 })
  }

  const categoryId  = refItem.category_id
  const familyName  = refItem.family_name ?? refItem.title

  // ── 2. Cargar variantes del producto ROIPOS ───────────────────────────────────
  const { rows: variants } = await pool.query<ProductVariantRow>(
    `SELECT id, color, size FROM product_variants WHERE product_id = $1`,
    [productId],
  )
  if (!variants.length) {
    return NextResponse.json({ error: 'El producto no tiene variantes en ROIPOS' }, { status: 400 })
  }

  // ── 3. Buscar todos los ítems ML del vendedor con el mismo family_name ────────
  const user        = await mlFetch<{ id: number }>(businessId, '/users/me')
  const mlUserId    = user.id

  const searchRes   = await mlFetch<{ results: string[] }>(
    businessId,
    `/users/${mlUserId}/items/search?category=${categoryId}&limit=50`,
  )

  // Para cada ítem: leer atributos y filtrar por family_name
  const linked:    Array<{ mlItemId: string; variantId: number; color: string | null; size: string | null }> = []
  const unmatched: Array<{ mlItemId: string; color: string | null; size: string | null; reason: string }>   = []
  const skipped:   string[] = []

  for (const itemId of searchRes.results ?? []) {
    let item: MLItemFull
    try {
      item = await mlFetch<MLItemFull>(businessId, `/items/${itemId}?include_attributes=all`)
    } catch {
      skipped.push(itemId)
      continue
    }

    // Filtramos por family_name (comparación case-insensitive)
    const itemFamily = item.family_name ?? item.title
    if (itemFamily.toLowerCase() !== familyName.toLowerCase()) continue

    // Verificar si ya está vinculado
    const { rows: existing } = await pool.query(
      `SELECT id FROM ml_items WHERE ml_item_id = $1 AND business_id = $2 LIMIT 1`,
      [itemId, businessId],
    )
    if (existing.length) {
      skipped.push(`${itemId} (ya vinculado)`)
      continue
    }

    const attrs = item.attributes ?? []
    const mlSize  = attrs.find(a => a.id === 'SIZE')?.value_name  ?? null
    const mlColor = attrs.find(a => a.id === 'COLOR')?.value_name ?? null

    // Buscar variante ROIPOS con color+size coincidentes.
    // Estrategia: exacto primero, luego "contiene" (ej: ML="Verde", ROIPOS="Verde y Blanco Rayado").
    const colorMatch = (roiColor: string | null, mlCol: string | null) => {
      if (!mlCol || !roiColor) return true   // si alguno es nulo, no filtramos por color
      const r = roiColor.toLowerCase(), m = mlCol.toLowerCase()
      return r === m || r.includes(m) || m.includes(r)
    }
    const sizeMatch = (roiSize: string | null, mlSz: string | null) => {
      if (!mlSz || !roiSize) return true
      return roiSize.toLowerCase() === mlSz.toLowerCase()
    }

    // 1er intento: exacto en ambos
    let match = variants.find(v =>
      sizeMatch(v.size, mlSize) &&
      v.color?.toLowerCase() === mlColor?.toLowerCase()
    )
    // 2do intento: contains en color
    if (!match) {
      match = variants.find(v => sizeMatch(v.size, mlSize) && colorMatch(v.color, mlColor))
    }

    if (!match) {
      const available = variants.map(v => `${v.color ?? '—'} / T${v.size ?? '—'}`).join(', ')
      unmatched.push({
        mlItemId: itemId,
        color:    mlColor,
        size:     mlSize,
        reason:   `No hay variante con color="${mlColor}" size="${mlSize}". Disponibles en ROIPOS: ${available}`,
      })
      continue
    }

    // Insertar en ml_items
    await pool.query(
      `INSERT INTO ml_items
         (business_id, product_id, product_variant_id, ml_item_id, ml_status, last_sync_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (product_variant_id, business_id)
         WHERE product_variant_id IS NOT NULL
       DO UPDATE
         SET ml_item_id   = EXCLUDED.ml_item_id,
             ml_status    = EXCLUDED.ml_status,
             last_sync_at = NOW()`,
      [businessId, productId, match.id, itemId, item.status === 'active' ? 'active' : 'paused'],
    )

    linked.push({ mlItemId: itemId, variantId: match.id, color: mlColor, size: mlSize })
  }

  return NextResponse.json({
    ok:         true,
    familyName,
    categoryId,
    linked,
    unmatched,
    skipped,
    linkedCount: linked.length,
  })
}
