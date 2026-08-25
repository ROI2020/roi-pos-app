import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/orders/online/count-pending
 *
 * Devuelve el número de pedidos en estado 'pending'.
 * Usado por el badge del nav. Requiere auth.
 */
export async function GET() {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  try {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM online_orders
       WHERE business_id = $1 AND status = 'pending'`,
      [businessId]
    )
    return NextResponse.json({ count: rows[0].count })
  } catch (err) {
    console.error('[GET /api/orders/online/count-pending]', err)
    return NextResponse.json({ count: 0 })
  }
}
