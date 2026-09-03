/**
 * lib/products.ts — Punto único de contacto con la tabla `products`.
 *
 * Exports:
 *   upsertProduct()  — INSERT / INSERT ON CONFLICT (crea o sincroniza)
 *   updateProduct()  — UPDATE parcial tipado (reemplaza el ALLOWED-list dinámico)
 *
 * upsertProduct: sin cjPid → INSERT simple; con cjPid → ON CONFLICT por cj_pid.
 * Slug:          asignado por el trigger DB trg_products_slug_insert (BEFORE INSERT).
 *               El RETURNING lo devuelve ya seteado; no hay lógica de slug aquí.
 *
 * Agregar un campo nuevo a products → una sola vez aquí, cubre todos los orígenes.
 */

import type { Pool, PoolClient } from 'pg'

type DBClient = Pool | PoolClient

// ── Input ──────────────────────────────────────────────────────────────────────

export interface ProductInput {
  // Obligatorios
  businessId:       number
  name:             string

  // Comunes opcionales
  longName?:        string | null   // nombre largo del proveedor
  description?:     string | null
  basePrice?:       number          // default 0
  categoryId?:      number | null
  exportableWeb?:   boolean         // default false para físicos, true para CJ
  cuotas?:          number          // default 0
  generalImageUrl?: string | null
  weightGrams?:     number | null

  // CJ Dropshipping ── cuando está presente activa ON CONFLICT por cjPid
  cjPid?:           string | null
  cjData?:          object | null
  cjCostUsd?:       number | null
  markupPct?:       number | null
}

// ── Output ─────────────────────────────────────────────────────────────────────

export interface ProductRecord {
  id:      number
  slug:    string | null   // null solo si la migración del trigger no fue ejecutada
  /**
   * true  = fila nueva (INSERT corrió, trigger generó slug)
   * false = fila existente actualizada (ON CONFLICT DO UPDATE)
   *         Solo posible cuando cjPid está presente.
   */
  created: boolean
}

// ── upsertProduct ──────────────────────────────────────────────────────────────

export async function upsertProduct(
  client: DBClient,
  input: ProductInput,
): Promise<ProductRecord> {
  const {
    businessId,
    name,
    longName         = null,
    description      = null,
    basePrice        = 0,
    categoryId       = null,
    exportableWeb    = input.cjPid ? true : false,  // CJ activo por defecto, físico no
    cuotas           = 0,
    generalImageUrl  = null,
    weightGrams      = null,
    // CJ-specific
    cjPid            = null,
    cjData           = null,
    cjCostUsd        = null,
    markupPct        = null,
  } = input

  if (cjPid) {
    // ── Ruta CJ: INSERT ... ON CONFLICT (business_id, cj_pid) ─────────────
    // DO UPDATE actualiza datos del proveedor.
    // name y slug NO se tocan — el admin puede haberlos curado.
    const { rows: [row] } = await client.query<{
      id: number; slug: string | null; created: boolean
    }>(
      `INSERT INTO products
         (business_id, name, long_name, description, base_price,
          general_image_url, weight_grams, cj_pid, cj_last_sync,
          exportable_web, cuotas, cj_data, cj_cost_usd, markup_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13)
       ON CONFLICT (business_id, cj_pid) WHERE cj_pid IS NOT NULL
       DO UPDATE SET
         long_name         = EXCLUDED.long_name,
         description       = EXCLUDED.description,
         base_price        = EXCLUDED.base_price,
         general_image_url = EXCLUDED.general_image_url,
         weight_grams      = EXCLUDED.weight_grams,
         cj_last_sync      = NOW(),
         cj_data           = EXCLUDED.cj_data,
         cj_cost_usd       = EXCLUDED.cj_cost_usd,
         markup_pct        = EXCLUDED.markup_pct
         -- name y slug quedan intactos (curados por el admin)
       RETURNING id, slug, (xmax = 0) AS created`,
      [
        businessId, name.trim(), longName, description, basePrice,
        generalImageUrl, weightGrams, cjPid, exportableWeb, cuotas,
        cjData !== null ? JSON.stringify(cjData) : null, cjCostUsd, markupPct,
      ],
    )
    return { id: row.id, slug: row.slug, created: Boolean(row.created) }
  }

  // ── Ruta estándar: INSERT simple ───────────────────────────────────────────
  // Slug asignado por trigger DB. category_id incluido (puede ser null).
  const { rows: [row] } = await client.query<{ id: number; slug: string | null }>(
    `INSERT INTO products
       (business_id, name, long_name, description, base_price,
        category_id, exportable_web, cuotas, general_image_url, weight_grams)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, slug`,
    [
      businessId, name.trim(), longName, description, basePrice,
      categoryId, exportableWeb, cuotas, generalImageUrl, weightGrams,
    ],
  )
  return { id: row.id, slug: row.slug, created: true }
}

// ── updateProduct ──────────────────────────────────────────────────────────────

/**
 * Campos modificables por el admin.
 * Solo las claves presentes en este tipo pueden llegar al UPDATE.
 * TypeScript reemplaza el array ALLOWED de strings — si el campo no existe
 * en esta interfaz, el compilador lo rechaza antes de llegar al DB.
 *
 * Regla de slug: si el admin cambia `name`, el slug NO se regenera automáticamente
 * (la URL ya está indexada). Si quiere cambiarla, puede pasar `slug` explícitamente.
 */
export interface ProductUpdateInput {
  // Contenido
  name?:                string
  longName?:            string | null
  description?:         string | null
  basePrice?:           number
  cuotas?:              number
  markupPct?:           number | null
  slug?:                string | null   // solo si el admin quiere redirigir la URL

  // Clasificación
  categoryId?:          number | null
  ageGroupId?:          number | null
  seasonId?:            number | null
  genderId?:            number | null

  // Imagen local (físico)
  photoUrl?:            string | null

  // Canales de exposición
  exportableWeb?:       boolean
  exportableWhatsapp?:  boolean
  exportableInstagram?: boolean
  exportableFacebook?:  boolean
}

/** Mapa camelCase → nombre de columna en la tabla `products`. */
const COLUMN: Record<keyof ProductUpdateInput, string> = {
  name:                'name',
  longName:            'long_name',
  description:         'description',
  basePrice:           'base_price',
  cuotas:              'cuotas',
  markupPct:           'markup_pct',
  slug:                'slug',
  categoryId:          'category_id',
  ageGroupId:          'age_group_id',
  seasonId:            'season_id',
  genderId:            'gender_id',
  photoUrl:            'photo_url',
  exportableWeb:       'exportable_web',
  exportableWhatsapp:  'exportable_whatsapp',
  exportableInstagram: 'exportable_instagram',
  exportableFacebook:  'exportable_facebook',
}

/**
 * UPDATE parcial tipado.
 * Solo actualiza los campos provistos (undefined = no tocar).
 * Devuelve null si el producto no existe o no pertenece al negocio.
 */
export async function updateProduct(
  client: DBClient,
  id: number,
  businessId: number,
  fields: ProductUpdateInput,
): Promise<ProductRecord | null> {
  const entries = (Object.entries(fields) as [keyof ProductUpdateInput, unknown][])
    .filter(([, v]) => v !== undefined)

  if (entries.length === 0) return null

  const setClauses = entries.map(([key], i) => `${COLUMN[key]} = $${i + 1}`)
  const values     = entries.map(([, v]) => v ?? null)

  // Si el admin cambia el name, lo normalizamos igual que en upsertProduct
  const nameIdx = entries.findIndex(([k]) => k === 'name')
  if (nameIdx !== -1 && typeof values[nameIdx] === 'string') {
    values[nameIdx] = (values[nameIdx] as string).trim()
  }

  values.push(id, businessId)
  const idP  = values.length - 1
  const bizP = values.length

  const { rows } = await client.query<{ id: number; slug: string | null }>(
    `UPDATE products
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${idP} AND business_id = $${bizP}
     RETURNING id, slug`,
    values,
  )

  if (!rows.length) return null
  return { id: rows[0].id, slug: rows[0].slug, created: false }
}
