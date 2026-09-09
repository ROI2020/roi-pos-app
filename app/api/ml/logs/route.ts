/**
 * GET  /api/ml/logs          → últimos N logs del negocio
 * DELETE /api/ml/logs        → limpia todos los logs del negocio
 */

import { NextResponse }      from 'next/server'
import pool                  from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url   = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200)

  const { rows } = await pool.query(
    `SELECT id, created_at, action, request_body, response_body, error, ml_item_id
     FROM ml_api_logs
     WHERE business_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [businessId, limit],
  )

  return NextResponse.json(rows)
}

export async function DELETE(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rowCount } = await pool.query(
    `DELETE FROM ml_api_logs WHERE business_id = $1`,
    [businessId],
  )

  return NextResponse.json({ ok: true, deleted: rowCount })
}
