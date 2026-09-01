import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/orders/online
 *
 * Listado paginado de pedidos online — requiere auth.
 *
 * Query params:
 *   status   'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled'
 *   limit    default 40
 *   offset   default 0
 */
export async function GET(req: Request) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '40'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const conditions = [`oo.business_id = $1`]
  const params: (string | number)[] = [businessId]
  let p = 2

  if (status) {
    conditions.push(`oo.status = $${p++}`)
    params.push(status)
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  params.push(limit, offset)

  try {
    const { rows } = await pool.query<{
      id:                 number
      buyer_name:         string
      buyer_phone:        string
      buyer_email:        string | null
      delivery_type:      string
      subtotal:           number
      shipping_cost:      number
      total:              number
      status:             string
      payment_method:     string | null
      fulfillment_status: string | null
      cj_order_id:        string | null
      cj_order_num:       string | null
      cj_tracking_no:     string | null
      item_count:         number
      tracking_number:    string | null
      shipment_status:    string | null
      created_at:         string
      updated_at:         string
    }>(
      `SELECT
         oo.id,
         oo.buyer_name,
         oo.buyer_phone,
         oo.buyer_email,
         oo.delivery_type,
         oo.subtotal::float,
         oo.shipping_cost::float,
         oo.total::float,
         oo.status,
         oo.payment_method,
         oo.fulfillment_status,
         oo.cj_order_id,
         oo.cj_order_num,
         oo.cj_tracking_no,
         COUNT(ooi.id)::int AS item_count,
         sh.tracking_number,
         sh.status AS shipment_status,
         oo.created_at,
         oo.updated_at
       FROM online_orders oo
       LEFT JOIN online_order_items ooi ON ooi.online_order_id = oo.id
       LEFT JOIN shipments sh ON sh.online_order_id = oo.id
       ${where}
       GROUP BY oo.id, sh.tracking_number, sh.status
       ORDER BY oo.created_at DESC
       LIMIT $${p++} OFFSET $${p}`,
      params
    )

    return NextResponse.json(rows)
  } catch (err) {
    console.error('[GET /api/orders/online]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
