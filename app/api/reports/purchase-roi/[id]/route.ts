import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

/**
 * GET /api/reports/purchase-roi/[id]
 *
 * Detalle de una compra: productos agrupados, cada uno con sus variantes.
 * Usado para el drill-down al expandir una fila de compra.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await requireFeature('finance.reports')
  if (blocked) return blocked

  const { id } = await params

  const { rows } = await pool.query(`
    SELECT
      p.id                                                                         AS product_id,
      p.name                                                                       AS product_name,
      p.base_price::float                                                          AS base_price,
      COUNT(DISTINCT pv.id)::int                                                   AS total_units,
      COALESCE(SUM(pd.unit_cost), 0)::float                                        AS total_cost,
      COUNT(DISTINCT pv.id) FILTER (WHERE sd.id IS NOT NULL)::int                  AS sold_units,
      COALESCE(SUM(sd.unit_price)  FILTER (WHERE sd.id IS NOT NULL), 0)::float     AS revenue,
      COALESCE(SUM(pd.unit_cost)   FILTER (WHERE sd.id IS NOT NULL), 0)::float     AS cost_of_sold,
      MAX(sal.sold_at)                                                              AS last_sale_at,
      EXTRACT(DAY FROM NOW() - pu.purchase_date::timestamp)::int                   AS days_since_purchase,
      -- Para edición inline de costo
      COUNT(DISTINCT pd.id)::int                                                   AS detail_count,
      MIN(pd.id)                                                                   AS purchase_detail_id,
      MIN(pd.unit_cost::float)                                                     AS unit_cost_per_item,
      -- Variantes como JSON para el sub-drill-down
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id',         pv.id,
          'sku',        pv.sku,
          'color',      pv.color,
          'size',       pv.size,
          'unit_cost',  pd.unit_cost::float,
          'status',     CASE
                          WHEN sd.id IS NOT NULL THEN 'vendido'
                          WHEN bi.id IS NOT NULL THEN 'en_stock'
                          ELSE 'sin_asignar'
                        END,
          'sale_price', sd.unit_price::float,
          'sold_at',    sal.sold_at
        )
        ORDER BY
          pv.color,
          CASE WHEN pv.size ~ '^[0-9]+$' THEN pv.size::int ELSE 9999 END,
          pv.size
      )                                                                            AS variants
    FROM purchases         pu
    JOIN purchase_details  pd  ON pd.purchase_id        = pu.id
    JOIN products          p   ON p.id                  = pd.product_id
    JOIN product_variants  pv  ON pv.purchase_detail_id = pd.id
    LEFT JOIN sale_details sd  ON sd.product_variant_id = pv.id
    LEFT JOIN sales        sal ON sal.id                = sd.sale_id
    LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
    WHERE pu.id = $1
    GROUP BY p.id, p.name, p.base_price, pu.purchase_date
    ORDER BY p.name
  `, [parseInt(id)])

  return NextResponse.json(rows)
}
