import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/pos/lookup?q=VALOR&branch_id=1
 *
 * Prioridad de búsqueda:
 *   1. Coincidencia exacta de barcode o SKU → devuelve 1 resultado (modo 'exact')
 *   2. Búsqueda multi-token               → devuelve hasta 30 resultados (modo 'search')
 *
 * Búsqueda multi-token:
 *   La query se separa en palabras. Cada palabra debe aparecer en AL MENOS UNO de:
 *   nombre del producto, color, talle, 'T'+talle, SKU, barcode,
 *   categoría, grupo de edad, temporada, género.
 *   Todos los tokens deben coincidir (AND entre tokens, OR entre campos).
 *
 *   Ejemplo: "jean gris T14"
 *     → token 'jean' : p.name ILIKE '%jean%' OR ...
 *     → token 'gris' : pv.color ILIKE '%gris%' OR ...
 *     → token 'T14'  : pv.size ILIKE '%T14%' OR ('T'||pv.size) ILIKE '%T14%' OR ...
 *
 * Solo devuelve variantes en stock (branch_inventory) de la sucursal indicada.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q')?.trim() ?? ''
  const branchId = searchParams.get('branch_id')

  if (!q)        return NextResponse.json({ error: 'Parámetro q requerido'         }, { status: 400 })
  if (!branchId) return NextResponse.json({ error: 'Parámetro branch_id requerido' }, { status: 400 })

  const bid = parseInt(branchId)

  // ── SELECT base ───────────────────────────────────────────────────────────
  const BASE = `
    FROM product_variants pv
    JOIN  products         p   ON p.id   = pv.product_id
    JOIN  branch_inventory bi  ON bi.product_variant_id = pv.id
    JOIN  branches         br  ON br.id  = bi.branch_id
    LEFT JOIN categories   c   ON c.id   = p.category_id
    LEFT JOIN age_groups   ag  ON ag.id  = p.age_group_id
    LEFT JOIN seasons      s   ON s.id   = p.season_id
    LEFT JOIN genders      g   ON g.id   = p.gender_id
  `
  const COLS = `
    pv.id,
    pv.sku,
    COALESCE(pv.barcode, pv.sku) AS barcode,
    pv.color,
    pv.size,
    p.id          AS product_id,
    p.name        AS product_name,
    p.base_price::float,
    c.name        AS category_name,
    ag.name       AS age_group_name,
    s.name        AS season_name,
    g.name        AS gender_name,
    bi.branch_id,
    br.name       AS branch_name
  `
  const ORDER = `
    ORDER BY
      p.name, pv.color,
      CASE WHEN pv.size ~ '^[0-9]+$' THEN pv.size::int ELSE 9999 END,
      pv.size
  `

  // ── 1. Exacto: barcode o SKU ───────────────────────────────────────────
  const exact = await pool.query(
    `SELECT ${COLS} ${BASE}
     WHERE bi.branch_id = $1
       AND (LOWER(pv.barcode) = LOWER($2) OR LOWER(pv.sku) = LOWER($2))
     LIMIT 1`,
    [bid, q]
  )
  if (exact.rows.length > 0) {
    return NextResponse.json({ mode: 'exact', results: exact.rows })
  }

  // ── 2. Multi-token ────────────────────────────────────────────────────────
  const tokens = q.split(/\s+/).filter(t => t.length > 0)

  const params: (string | number)[] = [bid]
  const andClauses: string[] = []

  for (const token of tokens) {
    params.push(`%${token}%`)
    const pi = params.length     // índice del parámetro actual
    andClauses.push(`(
        p.name                    ILIKE $${pi}
     OR pv.color                  ILIKE $${pi}
     OR pv.size                   ILIKE $${pi}
     OR ('T' || pv.size)          ILIKE $${pi}
     OR pv.sku                    ILIKE $${pi}
     OR COALESCE(pv.barcode,  '') ILIKE $${pi}
     OR COALESCE(c.name,      '') ILIKE $${pi}
     OR COALESCE(ag.name,     '') ILIKE $${pi}
     OR COALESCE(s.name,      '') ILIKE $${pi}
     OR COALESCE(g.name,      '') ILIKE $${pi}
    )`)
  }

  const where = [
    'bi.branch_id = $1',
    ...andClauses,
  ].join('\n   AND ')

  const partial = await pool.query(
    `SELECT ${COLS} ${BASE} WHERE ${where} ${ORDER} LIMIT 30`,
    params
  )

  return NextResponse.json({ mode: 'search', results: partial.rows })
}
