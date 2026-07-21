import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * PATCH /api/pos/sessions/[id]
 * Body: { closing_balance, notes, closed_by_user_id? }
 * Cierra la sesión de caja.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const bizResult = await requireBusinessId()
    if (bizResult instanceof NextResponse) return bizResult
    const { businessId } = bizResult

    const { id }                                            = await params
    const { closing_balance, notes, closed_by_user_id }    = await req.json()

    const { rows } = await pool.query(
      `UPDATE pos_sessions
         SET closed_at           = NOW(),
             closing_balance     = $1,
             notes               = $2,
             closed_by_user_id   = $3
       WHERE id = $4 AND closed_at IS NULL AND business_id = $5
       RETURNING *`,
      [
        parseFloat(closing_balance) || null,
        notes ?? null,
        closed_by_user_id ?? null,
        parseInt(id),
        businessId,
      ]
    )

    if (rows.length === 0)
      return NextResponse.json({ error: 'Sesión no encontrada o ya cerrada' }, { status: 404 })

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[PATCH /api/pos/sessions/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
