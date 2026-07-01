import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

/**
 * GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve ventas + cambios (cambios solo si involucran diferencia de precio,
 * ya que ese es el único caso que queda registrado en `sales`) en el rango dado,
 * cada una con sus prendas (sale_details), para la solapa "Ventas".
 */
export async function GET(req: Request) {
  const blocked = await requireFeature('finance.transactions')
  if (blocked) return blocked

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to son requeridos (YYYY-MM-DD)' }, { status: 400 })

  const { rows: ventas } = await pool.query(
    `SELECT
       'venta'                   AS type,
       s.id,
       s.id                      AS sale_id,
       s.invoice_number,
       s.sold_at,
       s.subtotal::float         AS subtotal,
       s.discount_amount::float  AS discount_amount,
       s.total_amount::float     AS total_amount,
       s.payment_method,
       s.payment_split,
       s.notes,
       s.branch_id,
       br.name                   AS branch_name,
       s.user_id,
       u.name                    AS user_name,
       NULL                      AS swap_description
     FROM sales s
     JOIN branches  br ON br.id = s.branch_id
     LEFT JOIN app_users u ON u.id = s.user_id
     WHERE s.sold_at::date BETWEEN $1::date AND $2::date
       AND NOT EXISTS (SELECT 1 FROM exchanges ex WHERE ex.exchange_sale_id = s.id)
     ORDER BY s.sold_at DESC`,
    [from, to]
  )

  const { rows: cambios } = await pool.query(
    `SELECT
       'cambio'                  AS type,
       ex.id,
       s.id                      AS sale_id,
       s.invoice_number,
       s.sold_at,
       s.subtotal::float         AS subtotal,
       s.discount_amount::float  AS discount_amount,
       s.total_amount::float     AS total_amount,
       COALESCE(ex.payment_method, 'cambio') AS payment_method,
       NULL::jsonb               AS payment_split,
       ex.notes,
       ex.branch_id,
       br.name                   AS branch_name,
       ex.user_id,
       u.name                    AS user_name,
       CONCAT(
         COALESCE(rp.name,'?'), ' T.', COALESCE(rv.size,'?'),
         ' → ',
         COALESCE(np.name,'?'), ' T.', COALESCE(nv.size,'?')
       )                         AS swap_description
     FROM exchanges ex
     JOIN sales s        ON s.id = ex.exchange_sale_id
     JOIN branches br    ON br.id = ex.branch_id
     LEFT JOIN app_users u         ON u.id  = ex.user_id
     LEFT JOIN product_variants rv ON rv.id = ex.returned_variant_id
     LEFT JOIN products          rp ON rp.id = rv.product_id
     LEFT JOIN product_variants nv ON nv.id = ex.new_variant_id
     LEFT JOIN products          np ON np.id = nv.product_id
     WHERE s.sold_at::date BETWEEN $1::date AND $2::date
     ORDER BY s.sold_at DESC`,
    [from, to]
  )

  const all = [...ventas, ...cambios]
  if (all.length === 0) return NextResponse.json([])

  const saleIds = [...new Set(all.map(r => r.sale_id as number))]

  const { rows: items } = await pool.query<{
    sale_id: number
    variant_id: number
    sku: string
    product_name: string
    color: string
    size: string
    unit_price: number
  }>(
    `SELECT
       sd.sale_id,
       pv.id          AS variant_id,
       pv.sku,
       p.name         AS product_name,
       pv.color,
       pv.size,
       sd.unit_price::float AS unit_price
     FROM sale_details sd
     JOIN product_variants pv ON pv.id = sd.product_variant_id
     JOIN products         p  ON p.id  = pv.product_id
     WHERE sd.sale_id = ANY($1::int[])
     ORDER BY sd.id`,
    [saleIds]
  )

  const itemsBySale = items.reduce<Record<number, typeof items>>((acc, item) => {
    if (!acc[item.sale_id]) acc[item.sale_id] = []
    acc[item.sale_id].push(item)
    return acc
  }, {})

  const result = all
    .map(r => ({
      ...r,
      items: (itemsBySale[r.sale_id as number] ?? []).map(i => ({
        id: i.variant_id, variant_id: i.variant_id,
        sku: i.sku, product_name: i.product_name,
        color: i.color, size: i.size,
        unit_price: i.unit_price, base_price: i.unit_price,
      })),
    }))
    .sort((a, b) => new Date(b.sold_at as string).getTime() - new Date(a.sold_at as string).getTime())

  return NextResponse.json(result)
}
