import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * POST /api/cash-transfers
 * Body: { pos_session_id, from_branch_id, amount, notes?, user_id? }
 *
 * Registra un retiro de efectivo de una sucursal a Caja Central.
 */
export async function POST(req: Request) {
  const { pos_session_id, from_branch_id, amount, notes, user_id } = await req.json()

  if (!from_branch_id)
    return NextResponse.json({ error: 'from_branch_id requerido' }, { status: 400 })
  if (!amount || parseFloat(amount) <= 0)
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })

  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO cash_transfers (pos_session_id, from_branch_id, amount, notes, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [pos_session_id ?? null, from_branch_id, parseFloat(amount), notes?.trim() || null, user_id ?? null]
    )
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/cash-transfers]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
