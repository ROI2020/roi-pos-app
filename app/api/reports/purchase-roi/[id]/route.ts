import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/reports/purchase-roi/[id]
 *
 * Detalle de una compra: productos agrupados, cada uno con sus variantes.
 * Usado para el drill-down al expandir una fila de compra.
 *
 * Descuentos: distribuidos proporcionalmente por ítem.
 *   gross_revenue  — venta bruta sin descuento
 *   discount       — descuento proporcional
 *   revenue        — venta NETA (base para márgenes)
 *   sale_price (en variante) — precio NETO de esa unidad vendida
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await requireFeature('finance.reports')
  if (blocked) return blocked

  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { id } = await params

  const { rows } = await pool.query(`
    SELECT
      p.id                                                                          AS product_id,
      p.name                                                                        AS product_name,
      p.base_price::float                                                           AS base_price,
      COUNT(DISTINCT pv.id)::int                                                    AS total_units,
      COALESCE(SUM(pd.unit_cost), 0)::float                                         AS total_cost,
      COUNT(DISTINCT pv.id) FILTER (WHERE sd.id IS NOT NULL)::int                   AS sold_units,

      -- Venta BRUTA
      COALESCE(SUM(sd.unit_price)
        FILTER (WHERE sd.id IS NOT NULL), 0)::float                                 AS gross_revenue,

      -- Descuento proporcional
      COALESCE(SUM(
        CASE WHEN sal.subtotal > 0
          THEN sd.unit_price * sal.discount_amount / sal.subtotal
          ELSE 0
        END
      ) FILTER (WHERE sd.id IS NOT NULL), 0)::float                                 AS discount,

      -- Venta NETA
      COALESCE(SUM(
        CASE WHEN sal.subtotal > 0
          THEN sd.unit_price * sal.total_amount / sal.subtotal
          ELSE sd.unit_price
        END
      ) FILTER (WHERE sd.id IS NOT NULL), 0)::float                                 AS revenue,

      COALESCE(SUM(pd.unit_cost)
        FILTER (WHERE sd.id IS NOT NULL), 0)::float                                 AS cost_of_sold,
      MAX(sal.sold_at)                                                               AS last_sale_at,
      EXTRACT(DAY FROM NOW() - pu.purchase_date::timestamp)::int                    AS days_since_purchase,

      -- Para edición inline de costo
      COUNT(DISTINCT pd.id)::int                                                    AS detail_count,
      MIN(pd.id)                                                                    AS purchase_detail_id,
      MIN(pd.unit_cost::float)                                                      AS unit_cost_per_item,

      -- Variantes como JSON para el sub-drill-down
      -- sale_price = precio NETO de esa unidad (bruto × total_amount / subtotal)
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
          'sale_price', CASE
                          WHEN sd.unit_price IS NULL THEN NULL
                          WHEN sal.subtotal > 0
                            THEN (sd.unit_price * sal.total_amount / sal.subtotal)::float
                          ELSE sd.unit_price::float
                        END,
          'gross_price', sd.unit_price::float,
          'sold_at',    sal.sold_at
        )
        ORDER BY
          pv.color,
          CASE WHEN pv.size ~ '^[0-9]+$' THEN pv.size::int ELSE 9999 END,
          pv.size
      )                                                                             AS variants
    FROM purchases         pu
    JOIN purchase_details  pd  ON pd.purchase_id        = pu.id
    JOIN products          p   ON p.id                  = pd.product_id
    JOIN product_variants  pv  ON pv.purchase_detail_id = pd.id
    LEFT JOIN sale_details sd  ON sd.product_variant_id = pv.id
    LEFT JOIN sales        sal ON sal.id                = sd.sale_id
    LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
    WHERE pu.id = $1
      AND pu.business_id = $2
    GROUP BY p.id, p.name, p.base_price, pu.purchase_date
    ORDER BY p.name
  `, [parseInt(id), businessId])

  return NextResponse.json(rows)
}
