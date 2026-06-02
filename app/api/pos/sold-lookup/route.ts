import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/pos/sold-lookup?q=VALOR&branch_id=1
 *
 * Busca artículos VENDIDOS en la sucursal indicada.
 * Útil para iniciar un cambio de mercadería.
 *
 * Prioridad:
 *   1. Coincidencia exacta de barcode o SKU → modo 'exact'
 *   2. Multi-token ILIKE                    → modo 'search', hasta 20 resultados
 *
 * Devuelve: id, sku, barcode, color, size, product_name,
 *           unit_price (precio que pagó el cliente), sale_detail_id, sale_id, sold_at
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q')?.trim() ?? ''
  const branchId = searchParams.get('branch_id')

  if (!q)        return NextResponse.json({ error: 'Parámetro q requerido'         }, { status: 400 })
  if (!branchId) return NextResponse.json({ error: 'Parámetro branch_id requerido' }, { status: 400 })

  const bid = parseInt(branchId)

  const COLS = `
    pv.id,
    pv.sku,
    COALESCE(pv.barcode, pv.sku) AS barcode,
    pv.color,
    pv.size,
    p.name        AS product_name,
    sd.unit_price::float,
    -- Precio efectivamente pagado: proporcional al descuento de la venta
    -- Si la venta tuvo 10% de descuento, este ítem también paga 10% menos
    CASE
      WHEN s.subtotal > 0
      THEN ROUND((sd.unit_price * s.total_amount / s.subtotal)::numeric, 2)::float
      ELSE sd.unit_price::float
    END                AS effective_price,
    s.subtotal::float,
    s.total_amount::float,
    s.discount_amount::float,
    sd.id         AS sale_detail_id,
    sd.sale_id,
    s.sold_at
  `
  const BASE = `
    FROM sale_details sd
    JOIN product_variants pv ON pv.id  = sd.product_variant_id
    JOIN products         p  ON p.id   = pv.product_id
    JOIN sales            s  ON s.id   = sd.sale_id
    LEFT JOIN categories  c  ON c.id   = p.category_id
    LEFT JOIN age_groups  ag ON ag.id  = p.age_group_id
    LEFT JOIN seasons     se ON se.id  = p.season_id
    LEFT JOIN genders     g  ON g.id   = p.gender_id
  `

  // ── 1. Exacto ─────────────────────────────────────────────────────────────────
  const exact = await pool.query(
    `SELECT ${COLS} ${BASE}
     WHERE s.branch_id = $1
       AND (LOWER(pv.barcode) = LOWER($2) OR LOWER(pv.sku) = LOWER($2))
     LIMIT 1`,
    [bid, q]
  )
  if (exact.rows.length > 0) {
    return NextResponse.json({ mode: 'exact', results: exact.rows })
  }

  // ── 2. Multi-token ────────────────────────────────────────────────────────────
  const tokens = q.split(/\s+/).filter(t => t.length > 0)
  const params: (string | number)[] = [bid]
  const andClauses: string[] = []

  for (const token of tokens) {
    params.push(`%${token}%`)
    const pi = params.length
    andClauses.push(`(
       p.name                    ILIKE $${pi}
    OR pv.color                  ILIKE $${pi}
    OR pv.size                   ILIKE $${pi}
    OR ('T' || pv.size)          ILIKE $${pi}
    OR pv.sku                    ILIKE $${pi}
    OR COALESCE(pv.barcode,  '') ILIKE $${pi}
    OR COALESCE(c.name,      '') ILIKE $${pi}
    OR COALESCE(ag.name,     '') ILIKE $${pi}
    OR COALESCE(se.name,     '') ILIKE $${pi}
    OR COALESCE(g.name,      '') ILIKE $${pi}
    )`)
  }

  const where = ['s.branch_id = $1', ...andClauses].join('\n   AND ')

  const partial = await pool.query(
    `SELECT ${COLS} ${BASE}
     WHERE ${where}
     ORDER BY s.sold_at DESC
     LIMIT 20`,
    params
  )

  return NextResponse.json({ mode: 'search', results: partial.rows })
}
