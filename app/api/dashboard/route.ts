import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/dashboard
 *
 * Cada product_variant tiene exactamente UNO de estos estados:
 *   - in_stock    → está en branch_inventory   (disponible para vender)
 *   - unassigned  → no está en branch_inventory, tampoco vendida
 *   - sold        → tiene fila en sale_details  (bajó del stock al venderse)
 *
 * Costo   → purchase_details.unit_cost  (via pv.purchase_detail_id)
 * Precio  → products.base_price         (precio de lista)
 * Ingreso → sale_details.unit_price     (precio real de venta)
 */
export async function GET() {

  // ── CTE base: une cada variante con su estado y datos financieros ──────────
  const baseCTE = `
    WITH base AS (
      SELECT
        pv.id                                        AS variant_id,
        p.id                                         AS product_id,
        p.category_id,
        p.age_group_id,
        p.season_id,
        p.gender_id,
        p.base_price,
        COALESCE(pd.unit_cost, 0)                   AS unit_cost,
        -- estado
        (bi.product_variant_id IS NOT NULL)         AS in_stock,
        bi.branch_id,
        (sd.product_variant_id IS NOT NULL)         AS is_sold,
        COALESCE(sd.unit_price, 0)                  AS sold_price
      FROM product_variants pv
      JOIN  products            p   ON p.id  = pv.product_id
      LEFT JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
      LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
      LEFT JOIN sale_details     sd ON sd.product_variant_id = pv.id
    )
  `

  const [summary, byCategory, byAgeGroup, bySeason, byGender, byBranch, unclassified] =
    await Promise.all([

      // ── Resumen global ───────────────────────────────────────────────────
      pool.query(`
        ${baseCTE}
        SELECT
          COUNT(*)::int                                               AS total,
          COUNT(*) FILTER (WHERE in_stock)::int                      AS in_stock,
          COUNT(*) FILTER (WHERE NOT in_stock AND NOT is_sold)::int  AS unassigned,
          COUNT(*) FILTER (WHERE is_sold)::int                       AS sold_count,
          COALESCE(SUM(unit_cost)  FILTER (WHERE in_stock),  0)::float AS stock_cost,
          COALESCE(SUM(base_price) FILTER (WHERE in_stock),  0)::float AS stock_potential,
          COALESCE(SUM(sold_price) FILTER (WHERE is_sold),   0)::float AS revenue
        FROM base
      `),

      // ── Por categoría ────────────────────────────────────────────────────
      pool.query(`
        ${baseCTE}
        SELECT
          COALESCE(c.name, 'Sin clasificar')                          AS name,
          COUNT(*) FILTER (WHERE b.in_stock)::int                     AS count,
          COALESCE(SUM(b.unit_cost)  FILTER (WHERE b.in_stock),0)::float AS cost,
          COALESCE(SUM(b.base_price) FILTER (WHERE b.in_stock),0)::float AS sale,
          COUNT(*) FILTER (WHERE b.is_sold)::int                      AS sold_count,
          COALESCE(SUM(b.sold_price) FILTER (WHERE b.is_sold), 0)::float AS revenue
        FROM base b
        LEFT JOIN categories c ON c.id = b.category_id
        GROUP BY c.name
        ORDER BY count DESC
      `),

      // ── Por edad ─────────────────────────────────────────────────────────
      pool.query(`
        ${baseCTE}
        SELECT
          COALESCE(ag.name, 'Sin clasificar')                          AS name,
          COUNT(*) FILTER (WHERE b.in_stock)::int                      AS count,
          COALESCE(SUM(b.unit_cost)  FILTER (WHERE b.in_stock),0)::float AS cost,
          COALESCE(SUM(b.base_price) FILTER (WHERE b.in_stock),0)::float AS sale,
          COUNT(*) FILTER (WHERE b.is_sold)::int                       AS sold_count,
          COALESCE(SUM(b.sold_price) FILTER (WHERE b.is_sold), 0)::float AS revenue
        FROM base b
        LEFT JOIN age_groups ag ON ag.id = b.age_group_id
        GROUP BY ag.name
        ORDER BY count DESC
      `),

      // ── Por temporada ────────────────────────────────────────────────────
      pool.query(`
        ${baseCTE}
        SELECT
          COALESCE(s.name, 'Sin clasificar')                           AS name,
          COUNT(*) FILTER (WHERE b.in_stock)::int                      AS count,
          COALESCE(SUM(b.unit_cost)  FILTER (WHERE b.in_stock),0)::float AS cost,
          COALESCE(SUM(b.base_price) FILTER (WHERE b.in_stock),0)::float AS sale,
          COUNT(*) FILTER (WHERE b.is_sold)::int                       AS sold_count,
          COALESCE(SUM(b.sold_price) FILTER (WHERE b.is_sold), 0)::float AS revenue
        FROM base b
        LEFT JOIN seasons s ON s.id = b.season_id
        GROUP BY s.name
        ORDER BY count DESC
      `),

      // ── Por género ───────────────────────────────────────────────────────
      pool.query(`
        ${baseCTE}
        SELECT
          COALESCE(g.name, 'Sin clasificar')                           AS name,
          COUNT(*) FILTER (WHERE b.in_stock)::int                      AS count,
          COALESCE(SUM(b.unit_cost)  FILTER (WHERE b.in_stock),0)::float AS cost,
          COALESCE(SUM(b.base_price) FILTER (WHERE b.in_stock),0)::float AS sale,
          COUNT(*) FILTER (WHERE b.is_sold)::int                       AS sold_count,
          COALESCE(SUM(b.sold_price) FILTER (WHERE b.is_sold), 0)::float AS revenue
        FROM base b
        LEFT JOIN genders g ON g.id = b.gender_id
        GROUP BY g.name
        ORDER BY count DESC
      `),

      // ── Por sucursal ─────────────────────────────────────────────────────
      // Solo muestra: prendas EN STOCK agrupadas por sucursal
      //              + prendas SIN ASIGNAR (no en stock Y no vendidas)
      // Las vendidas se excluyen (ya no tienen branch_id).
      pool.query(`
        ${baseCTE}
        SELECT
          COALESCE(br.name, 'Sin asignar')                             AS name,
          COUNT(*)::int                                                 AS count,
          COALESCE(SUM(b.unit_cost),  0)::float                        AS cost,
          COALESCE(SUM(b.base_price), 0)::float                        AS sale,
          0::int                                                        AS sold_count,
          0::float                                                      AS revenue
        FROM base b
        LEFT JOIN branches br ON br.id = b.branch_id
        WHERE b.in_stock OR (NOT b.in_stock AND NOT b.is_sold)
        GROUP BY br.name
        ORDER BY count DESC
      `),

      // ── Productos sin clasificar ─────────────────────────────────────────
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM products
        WHERE category_id  IS NULL
           OR age_group_id IS NULL
           OR season_id    IS NULL
           OR gender_id    IS NULL
      `),
    ])

  const s = summary.rows[0]

  return NextResponse.json({
    summary: {
      total:                 s.total            ?? 0,
      in_stock:              s.in_stock          ?? 0,
      unassigned:            s.unassigned        ?? 0,
      sold_count:            s.sold_count        ?? 0,
      stock_cost:            s.stock_cost        ?? 0,
      stock_potential:       s.stock_potential   ?? 0,
      revenue:               s.revenue           ?? 0,
      unclassified_products: unclassified.rows[0]?.count ?? 0,
    },
    by_category:  byCategory.rows,
    by_age_group: byAgeGroup.rows,
    by_season:    bySeason.rows,
    by_gender:    byGender.rows,
    by_branch:    byBranch.rows,
  })
}
