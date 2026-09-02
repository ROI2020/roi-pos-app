import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

export interface RoiRangeData {
  vendido: number
  costo:   number
  gastos:  number
}

/** GET /api/kpi/roi-range?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to son requeridos' }, { status: 400 })

  try {
    const { rows } = await pool.query(`
      SELECT
        -- Ventas POS + online confirmadas (sale_id seteado → ya en sales)
        -- + online sin sale (PayPal: sale_id IS NULL, pagadas pero sin confirmar en POS)
        (
          (SELECT COALESCE(SUM(s.total_amount), 0)::float
           FROM sales s
           WHERE s.sold_at >= $1::date AND s.sold_at < ($2::date + interval '1 day')
             AND s.business_id = $3)
          +
          (SELECT COALESCE(SUM(oo.total), 0)::float
           FROM online_orders oo
           WHERE oo.sale_id IS NULL
             AND oo.status IN ('approved', 'preparing', 'delivered')
             AND (oo.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                 BETWEEN $1::date AND $2::date
             AND oo.business_id = $3)
        ) AS vendido,

        -- Costo POS + online confirmados (vía sale_details → purchase_details)
        -- + Costo online sin sale (CJ PayPal: unit_cost_usd snapsheado al checkout)
        (
          (SELECT COALESCE(SUM(COALESCE(pd.unit_cost, 0)), 0)::float
           FROM sale_details sd
           JOIN sales sv ON sv.id = sd.sale_id
           JOIN product_variants pv ON pv.id = sd.product_variant_id
           LEFT JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
           WHERE sv.sold_at >= $1::date AND sv.sold_at < ($2::date + interval '1 day')
             AND sv.business_id = $3)
          +
          (SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0)::float
           FROM online_order_items oi
           JOIN online_orders oo ON oo.id = oi.online_order_id
           WHERE oo.sale_id IS NULL
             AND oo.status IN ('approved', 'preparing', 'delivered')
             AND (oo.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                 BETWEEN $1::date AND $2::date
             AND oo.business_id = $3
             AND oi.unit_cost IS NOT NULL)
        ) AS costo,

        (SELECT COALESCE(SUM(e.amount), 0)::float
         FROM daily_expenses e
         WHERE e.created_at >= $1::date AND e.created_at < ($2::date + interval '1 day')
           AND e.business_id = $3) AS gastos
    `, [from, to, businessId])

    return NextResponse.json(rows[0] as RoiRangeData)
  } catch (err) {
    console.error('[roi-range]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
