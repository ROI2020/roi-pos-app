import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const branchId = parseInt(searchParams.get('branch_id') ?? '')

  if (!branchId) {
    return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })
  }

  try {
    const { rows: sales } = await pool.query<{
      id: number
      invoice_number: string | null
      sold_at: string
      subtotal: number
      discount_amount: number
      total_amount: number
      payment_method: string
      notes: string | null
      user_id: number | null
      user_name: string | null
    }>(
      `SELECT
         s.id,
         s.invoice_number,
         s.sold_at,
         s.subtotal::float        AS subtotal,
         s.discount_amount::float AS discount_amount,
         s.total_amount::float    AS total_amount,
         s.payment_method,
         s.notes,
         s.user_id,
         u.name                   AS user_name
       FROM sales s
       LEFT JOIN app_users u ON u.id = s.user_id
       WHERE s.branch_id = $1
         AND s.sold_at >= CURRENT_DATE
         AND s.sold_at <  CURRENT_DATE + INTERVAL '1 day'
         AND NOT EXISTS (SELECT 1 FROM exchanges ex WHERE ex.exchange_sale_id = s.id)
       ORDER BY s.sold_at DESC`,
      [branchId]
    )

    if (sales.length === 0) return NextResponse.json([])

    const saleIds = sales.map(s => s.id)

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

    const result = sales.map(s => ({
      ...s,
      items: (itemsBySale[s.id] ?? []).map(i => ({
        id: i.variant_id, variant_id: i.variant_id,
        sku: i.sku, product_name: i.product_name,
        color: i.color, size: i.size,
        unit_price: i.unit_price, base_price: i.unit_price,
      })),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/sales/today]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
