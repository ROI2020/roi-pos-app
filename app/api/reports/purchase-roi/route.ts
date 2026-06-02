import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/reports/purchase-roi?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Una fila por compra dentro del rango de fechas.
 * Devuelve: id, fecha, título, proveedor, total_units, total_cost,
 *           sold_units, revenue, cost_of_sold, last_sale_at,
 *           days_since_purchase
 *
 * Los porcentajes (margen, % vendido) y colores se calculan en el cliente.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to requeridos' }, { status: 400 })

  const { rows } = await pool.query(`
    SELECT
      pu.id,
      pu.purchase_date,
      pu.title,
      pu.invoice_number,
      s.company_name                                                              AS supplier_name,
      COUNT(DISTINCT pv.id)::int                                                  AS total_units,
      COALESCE(SUM(pd.unit_cost), 0)::float                                       AS total_cost,
      COUNT(DISTINCT pv.id) FILTER (WHERE sd.id IS NOT NULL)::int                 AS sold_units,
      COALESCE(SUM(sd.unit_price)  FILTER (WHERE sd.id IS NOT NULL), 0)::float    AS revenue,
      COALESCE(SUM(pd.unit_cost)   FILTER (WHERE sd.id IS NOT NULL), 0)::float    AS cost_of_sold,
      MAX(sal.sold_at)                                                             AS last_sale_at,
      EXTRACT(DAY FROM NOW() - pu.purchase_date::timestamp)::int                  AS days_since_purchase
    FROM purchases pu
    LEFT JOIN suppliers         s   ON s.id   = pu.supplier_id
    LEFT JOIN purchase_details  pd  ON pd.purchase_id = pu.id
    LEFT JOIN product_variants  pv  ON pv.purchase_detail_id = pd.id
    LEFT JOIN sale_details      sd  ON sd.product_variant_id = pv.id
    LEFT JOIN sales             sal ON sal.id = sd.sale_id
    WHERE pu.purchase_date::date BETWEEN $1 AND $2
    GROUP BY pu.id, pu.purchase_date, pu.title, pu.invoice_number, s.company_name
    ORDER BY pu.purchase_date DESC
  `, [from, to])

  return NextResponse.json(rows)
}
