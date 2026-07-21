import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/reports/purchase-roi
 *
 * Query params:
 *   from       YYYY-MM-DD  (requerido)
 *   to         YYYY-MM-DD  (requerido)
 *   supplier   texto libre — ILIKE sobre company_name
 *   product    texto libre — ILIKE sobre product name (filtra compras que contengan ese producto)
 */
export async function GET(req: Request) {
  const blocked = await requireFeature('finance.reports')
  if (blocked) return blocked

  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')
  const supplier = searchParams.get('supplier')?.trim() ?? ''
  const product  = searchParams.get('product')?.trim()  ?? ''

  if (!from || !to)
    return NextResponse.json({ error: 'from y to requeridos' }, { status: 400 })

  const params: (string | number)[] = [from, to]
  let p = 3

  const extraConditions: string[] = []

  if (supplier) {
    extraConditions.push(`s.company_name ILIKE $${p++}`)
    params.push(`%${supplier}%`)
  }

  if (product) {
    // Filtra solo las compras que contengan al menos un producto con ese nombre
    extraConditions.push(`
      pu.id IN (
        SELECT DISTINCT pd2.purchase_id
        FROM purchase_details pd2
        JOIN products pr2 ON pr2.id = pd2.product_id
        WHERE pr2.name ILIKE $${p++}
      )
    `)
    params.push(`%${product}%`)
  }

  // Add businessId as the last parameter
  params.push(businessId)
  const bizParamNum = params.length

  const extraWhere = extraConditions.length
    ? 'AND ' + extraConditions.join(' AND ')
    : ''

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
    ${extraWhere}
    AND pu.business_id = $${bizParamNum}
    GROUP BY pu.id, pu.purchase_date, pu.title, pu.invoice_number, s.company_name
    ORDER BY pu.purchase_date DESC
  `, params)

  return NextResponse.json(rows)
}
