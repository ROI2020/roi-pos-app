import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/reports/products-sold?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve una fila por producto con sus métricas de ventas en el período.
 * Solo aparecen productos con al menos 1 venta en el rango (INNER JOIN con sales).
 * Excluye ventas que son parte de un canje (exchanges).
 */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to requeridos' }, { status: 400 })

  const { rows } = await pool.query(`
    SELECT
      COALESCE(c.name, 'Sin categoría')  AS category,
      COALESCE(g.name, 'Sin género')     AS gender,
      p.id                               AS product_id,
      p.name                             AS product_name,

      -- Stock actual (todas las sucursales, sin filtro de fecha)
      COALESCE((
        SELECT COUNT(bi.id)::int
        FROM product_variants pv2
        JOIN branch_inventory bi ON bi.product_variant_id = pv2.id
        WHERE pv2.product_id = p.id
      ), 0)                              AS stock_actual,

      -- Unidades vendidas en el período
      COUNT(sd.id)::int                  AS qty_sold,

      -- Ingreso total (precio de venta real, con descuentos)
      COALESCE(SUM(sd.unit_price), 0)::float  AS revenue,

      -- Costo total de lo vendido (costo de compra por unidad)
      COALESCE(SUM(pd.unit_cost),  0)::float  AS cost

    FROM products p
    LEFT JOIN categories c  ON c.id = p.category_id
    LEFT JOIN genders    g  ON g.id = p.gender_id
    JOIN  product_variants pv ON pv.product_id = p.id
    LEFT JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
    JOIN  sale_details sd ON sd.product_variant_id = pv.id
    JOIN  sales sal
           ON sal.id = sd.sale_id
          AND sal.sold_at::date BETWEEN $1 AND $2
          AND sal.business_id = $3
          AND NOT EXISTS (
            SELECT 1 FROM exchanges ex WHERE ex.exchange_sale_id = sal.id
          )
    WHERE p.business_id = $3
    GROUP BY c.name, g.name, p.id, p.name
    ORDER BY (COALESCE(SUM(sd.unit_price), 0) - COALESCE(SUM(pd.unit_cost), 0)) DESC NULLS LAST
  `, [from, to, businessId])

  return NextResponse.json(rows)
}
