import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getComplementaryKeywords, toIlikePatterns } from '@/lib/suggestion-rules'

/**
 * GET /api/catalog/suggestions
 *
 * Endpoint público — sin autenticación.
 *
 * Query params:
 *   category  string   — categoría del producto que se está mirando
 *   exclude   number   — id del producto actual (excluir de resultados)
 *   limit     number   — cantidad de sugerencias (default 8, max 16)
 *
 * Estrategia de ranking (en orden de prioridad):
 *   1. COMPLEMENTARY  — categorías que combinan bien (según suggestion-rules.ts)
 *                       ordenadas por ventas últimos 30 días DESC
 *   2. TRENDING       — cualquier otra categoría, por ventas últimos 30 días DESC
 *
 * Siempre se excluye la misma categoría del producto visto y productos sin stock.
 *
 * Responde: SuggestionProduct[]
 *   { id, name, price, category, has_image, specific_image_url,
 *     stock_total, sold_30d, reason }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const category  = searchParams.get('category')    // puede ser null
  const excludeId = parseInt(searchParams.get('exclude') ?? '0') || 0
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '8') || 8, 16)

  // ── Resolver negocio desde el dominio (igual que /api/catalog) ────────────
  const host       = req.headers.get('host') ?? ''
  const businessId = await resolveBusinessFromHost(host)

  // ── Complementary patterns desde las reglas configuradas ──────────────────
  const complementaryKws      = getComplementaryKeywords(category)
  const complementaryPatterns = complementaryKws ? toIlikePatterns(complementaryKws) : null

  try {
    const { rows } = await pool.query<{
      id:                 number
      name:               string
      price:              number
      category:           string | null
      has_image:          boolean
      specific_image_url: string | null
      stock_total:        number
      sold_30d:           number
      reason:             'complementary' | 'trending'
    }>(`
      WITH trending AS (
        -- Señal de ventas: unidades vendidas en los últimos 30 días por variante
        SELECT sd.product_variant_id, COUNT(sd.id)::int AS sold_30d
        FROM sale_details sd
        JOIN sales sal ON sal.id = sd.sale_id
        WHERE sal.sold_at > NOW() - INTERVAL '30 days'
        GROUP BY sd.product_variant_id
      )
      SELECT
        p.id,
        p.name,
        p.base_price::float                                            AS price,
        c.name                                                         AS category,
        (p.photo_url IS NOT NULL)                                      AS has_image,

        -- Imagen de la primera variante que tenga foto específica
        (
          SELECT pv2.specific_image_url
          FROM product_variants pv2
          WHERE pv2.product_id = p.id
            AND pv2.specific_image_url IS NOT NULL
          LIMIT 1
        )                                                              AS specific_image_url,

        COUNT(DISTINCT bi.id)::int                                     AS stock_total,
        COALESCE(SUM(t.sold_30d), 0)::int                              AS sold_30d,

        -- Razón de la sugerencia
        CASE
          WHEN $1::text[] IS NOT NULL AND c.name ILIKE ANY($1::text[])
            THEN 'complementary'
          ELSE 'trending'
        END                                                            AS reason

      FROM products p
      LEFT JOIN categories   c  ON c.id  = p.category_id
      JOIN  product_variants pv ON pv.product_id = p.id
      JOIN  branch_inventory bi ON bi.product_variant_id = pv.id
      LEFT JOIN trending     t  ON t.product_variant_id = pv.id

      WHERE p.exportable_web = true
        AND p.id != $2
        AND p.business_id = $5
        -- Excluir siempre la misma categoría del producto visto
        AND (
          $3::text IS NULL         -- el producto no tiene categoría → no filtrar
          OR c.name IS NULL        -- la sugerencia no tiene categoría → incluir igual
          OR c.name <> $3
        )

      GROUP BY p.id, p.name, p.base_price, c.name, p.photo_url

      HAVING COUNT(DISTINCT bi.id) > 0    -- solo productos con stock

      ORDER BY
        -- Complementarios primero, luego trending
        CASE
          WHEN $1::text[] IS NOT NULL AND c.name ILIKE ANY($1::text[]) THEN 1
          ELSE 2
        END,
        sold_30d  DESC,    -- los más vendidos arriba dentro de cada grupo
        stock_total DESC   -- desempate por mayor stock

      LIMIT $4
    `, [
      complementaryPatterns,  // $1 — array de patrones ILIKE o null
      excludeId,              // $2 — producto a excluir
      category,               // $3 — categoría actual (excluir misma cat)
      limit,                  // $4
      businessId,             // $5 — solo productos del mismo negocio
    ])

    return NextResponse.json(rows)

  } catch (err) {
    console.error('[GET /api/catalog/suggestions]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
