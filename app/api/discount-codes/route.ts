import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/discount-codes
 * Query params: source, used ('true'|'false'), limit, offset
 */
export async function GET(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source')
  const used   = searchParams.get('used')
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const conditions: string[] = ['dc.business_id = $1']
  const params: unknown[]    = [businessId]
  let p = 2

  if (source) { conditions.push(`dc.source = $${p++}`); params.push(source) }
  if (used === 'true')  conditions.push('dc.used_at IS NOT NULL')
  if (used === 'false') conditions.push('dc.used_at IS NULL AND dc.expires_at > NOW()')

  params.push(limit, offset)

  const { rows } = await pool.query(
    `SELECT
       dc.*,
       dc.value::float           AS value,
       c.name                    AS customer_name,
       c.phone                   AS customer_phone,
       p.summary                 AS promotion_summary,
       (dc.expires_at > NOW())   AS is_valid
     FROM discount_codes dc
     LEFT JOIN customers  c ON c.id = dc.customer_id
     LEFT JOIN promotions p ON p.id = dc.promotion_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY dc.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    params
  )
  return NextResponse.json(rows)
}
