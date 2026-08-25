/**
 * lib/correo/dimensions.ts — SERVER ONLY
 *
 * Calcula las dimensiones consolidadas del bulto para un pedido.
 *
 * Cascada por item:
 *   1. product.weight_grams / height_cm / width_cm / depth_cm  (si no null)
 *   2. category.weight_grams / ... del producto                 (si no null)
 *   3. settings: shipping_default_weight_grams / ...            (fallback global)
 *
 * Consolidación del bulto completo:
 *   - weight_grams: SUMA de todos los items
 *   - height_cm / width_cm / depth_cm: MÁXIMO de todos los items
 *     (asumiendo que las prendas se apilan y se usa la caja más grande)
 */

import pool from '@/lib/db'

export interface ItemDimensions {
  weight_grams: number
  height_cm:    number
  width_cm:     number
  depth_cm:     number
}

export interface BulkDimensions extends ItemDimensions {
  source_notes: string[]   // para debug: qué fallback se usó en cada item
}

// ── Carga defaults desde settings ────────────────────────────────────────────

async function loadDefaults(): Promise<ItemDimensions> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings
     WHERE key IN (
       'shipping_default_weight_grams',
       'shipping_default_height_cm',
       'shipping_default_width_cm',
       'shipping_default_depth_cm'
     ) AND business_id = 1`
  )
  const s = Object.fromEntries(rows.map(r => [r.key, parseFloat(r.value) || 0]))
  return {
    weight_grams: s.shipping_default_weight_grams ?? 500,
    height_cm:    s.shipping_default_height_cm    ?? 5,
    width_cm:     s.shipping_default_width_cm     ?? 30,
    depth_cm:     s.shipping_default_depth_cm     ?? 20,
  }
}

// ── Query de dimensiones por variante ─────────────────────────────────────────

interface VariantDimRow {
  variant_id:        number
  product_name:      string
  p_weight:          number | null
  p_height:          number | null
  p_width:           number | null
  p_depth:           number | null
  cat_weight:        number | null
  cat_height:        number | null
  cat_width:         number | null
  cat_depth:         number | null
}

async function loadVariantDims(variantIds: number[]): Promise<Map<number, VariantDimRow>> {
  if (variantIds.length === 0) return new Map()

  const placeholders = variantIds.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await pool.query<VariantDimRow>(
    `SELECT
       pv.id                   AS variant_id,
       p.name                  AS product_name,
       p.weight_grams          AS p_weight,
       p.height_cm             AS p_height,
       p.width_cm              AS p_width,
       p.depth_cm              AS p_depth,
       c.weight_grams          AS cat_weight,
       c.height_cm             AS cat_height,
       c.width_cm              AS cat_width,
       c.depth_cm              AS cat_depth
     FROM product_variants pv
     JOIN products p    ON p.id  = pv.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE pv.id = ANY($1::int4[])`,
    [variantIds]
  )

  return new Map(rows.map(r => [r.variant_id, r]))
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Dado un array de variantIds, devuelve las dimensiones consolidadas del bulto.
 */
export async function calcBulkDimensions(variantIds: number[]): Promise<BulkDimensions> {
  const [dimMap, defaults] = await Promise.all([
    loadVariantDims(variantIds),
    loadDefaults(),
  ])

  let totalWeight = 0
  let maxHeight   = 0
  let maxWidth    = 0
  let maxDepth    = 0
  const notes: string[] = []

  for (const vid of variantIds) {
    const row = dimMap.get(vid)
    if (!row) {
      // Variante no encontrada — usar defaults
      totalWeight += defaults.weight_grams
      maxHeight    = Math.max(maxHeight, defaults.height_cm)
      maxWidth     = Math.max(maxWidth,  defaults.width_cm)
      maxDepth     = Math.max(maxDepth,  defaults.depth_cm)
      notes.push(`variant:${vid} → default (no encontrada)`)
      continue
    }

    // Nivel 1: dimensiones del producto
    if (row.p_weight != null && row.p_height != null && row.p_width != null && row.p_depth != null) {
      totalWeight += row.p_weight
      maxHeight    = Math.max(maxHeight, row.p_height)
      maxWidth     = Math.max(maxWidth,  row.p_width)
      maxDepth     = Math.max(maxDepth,  row.p_depth)
      notes.push(`variant:${vid} (${row.product_name}) → producto`)
      continue
    }

    // Nivel 2: dimensiones de la categoría
    if (row.cat_weight != null && row.cat_height != null && row.cat_width != null && row.cat_depth != null) {
      totalWeight += row.cat_weight
      maxHeight    = Math.max(maxHeight, row.cat_height)
      maxWidth     = Math.max(maxWidth,  row.cat_width)
      maxDepth     = Math.max(maxDepth,  row.cat_depth)
      notes.push(`variant:${vid} (${row.product_name}) → categoría`)
      continue
    }

    // Nivel 3: defaults globales
    totalWeight += defaults.weight_grams
    maxHeight    = Math.max(maxHeight, defaults.height_cm)
    maxWidth     = Math.max(maxWidth,  defaults.width_cm)
    maxDepth     = Math.max(maxDepth,  defaults.depth_cm)
    notes.push(`variant:${vid} (${row.product_name}) → default global`)
  }

  return {
    weight_grams:  Math.round(totalWeight),
    height_cm:     maxHeight,
    width_cm:      maxWidth,
    depth_cm:      maxDepth,
    source_notes:  notes,
  }
}
