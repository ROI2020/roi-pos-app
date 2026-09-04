/**
 * GET /api/ml/orders
 *
 * Lista las órdenes de MercadoLibre capturadas desde el webhook.
 *
 * Query params:
 *   status  — 'paid' | 'cancelled' | ... (vacío = todas)
 *   limit   — default 40
 *   offset  — default 0
 */

import { NextResponse }      from 'next/server'
import pool                  from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

export interface MLOrderRow {
  id:                      number
  ml_order_id:             string
  pack_id:                 string | null
  ml_item_id:              string | null
  buyer_nickname:          string | null
  status:                  string
  total_amount:            number | null
  currency_id:             string
  quantity:                number
  unit_price:              number | null
  product_name:            string | null
  variant_color:           string | null
  variant_size:            string | null
  sale_id:                 number | null
  msg_confirmation_sent:   boolean
  msg_dispatched_sent:     boolean
  ml_date_created:         string | null
  created_at:              string
}

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url    = new URL(req.url)
  const status = url.searchParams.get('status') ?? ''
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '40'), 200)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  const conditions = ['mo.business_id = $1']
  const params: (string | number)[] = [businessId]
  let p = 2

  if (status) {
    conditions.push(`mo.status = $${p++}`)
    params.push(status)
  }

  params.push(limit, offset)

  const { rows } = await pool.query<MLOrderRow>(
    `SELECT
       mo.id,
       mo.ml_order_id::text,
       mo.pack_id::text,
       mo.ml_item_id,
       mo.buyer_nickname,
       mo.status,
       mo.total_amount::float,
       mo.currency_id,
       mo.quantity,
       mo.unit_price::float,
       pv.color  AS variant_color,
       pv.size   AS variant_size,
       p.name    AS product_name,
       mo.sale_id,
       mo.msg_confirmation_sent,
       mo.msg_dispatched_sent,
       mo.ml_date_created,
       mo.created_at
     FROM ml_orders mo
     LEFT JOIN product_variants pv ON pv.id = mo.product_variant_id
     LEFT JOIN products         p  ON p.id  = pv.product_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY mo.ml_date_created DESC NULLS LAST, mo.created_at DESC
     LIMIT $${p++} OFFSET $${p}`,
    params,
  )

  return NextResponse.json(rows)
}
