import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/pos/sessions?branch_id=1
 * Devuelve la sesión ACTIVA (closed_at IS NULL) de la sucursal,
 * con resumen de ventas Y gastos del turno.
 * Si no hay sesión activa → { session: null }
 *
 * Se usan subqueries para ventas y gastos por separado,
 * evitando el producto cartesiano de un doble LEFT JOIN.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get('branch_id')
  if (!branchId) return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })

  const { rows } = await pool.query(
    `SELECT
       ps.*,

       -- ── Ventas del turno ──────────────────────────────────────────────
       (SELECT COUNT(*)::int          FROM sales s WHERE s.pos_session_id = ps.id)           AS sales_count,
       (SELECT COALESCE(SUM(s.total_amount),0)::float FROM sales s WHERE s.pos_session_id = ps.id) AS sales_total,
       (SELECT COALESCE(SUM(s.total_amount),0)::float FROM sales s WHERE s.pos_session_id = ps.id AND s.payment_method = 'efectivo')      AS cash_total,
       (SELECT COALESCE(SUM(s.total_amount),0)::float FROM sales s WHERE s.pos_session_id = ps.id AND s.payment_method = 'debito')        AS debit_total,
       (SELECT COALESCE(SUM(s.total_amount),0)::float FROM sales s WHERE s.pos_session_id = ps.id AND s.payment_method = 'credito')       AS credit_total,
       (SELECT COALESCE(SUM(s.total_amount),0)::float FROM sales s WHERE s.pos_session_id = ps.id AND s.payment_method = 'mp')            AS mp_total,
       (SELECT COALESCE(SUM(s.total_amount),0)::float FROM sales s WHERE s.pos_session_id = ps.id AND s.payment_method = 'transferencia') AS transfer_total,

       -- ── Gastos del turno ──────────────────────────────────────────────
       (SELECT COUNT(*)::int          FROM daily_expenses e WHERE e.pos_session_id = ps.id)           AS expense_count,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id) AS expense_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'efectivo')      AS expense_cash_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'debito')        AS expense_debit_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'credito')       AS expense_credit_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'mp')            AS expense_mp_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'transferencia') AS expense_transfer_total,

       -- ── Nombres de sucursal y usuarios ────────────────────────────────
       br.name                    AS branch_name,
       opened_u.name              AS opened_by_user_name,
       closed_u.name              AS closed_by_user_name

     FROM pos_sessions ps
     LEFT JOIN branches  br       ON br.id       = ps.branch_id
     LEFT JOIN app_users opened_u ON opened_u.id = ps.opened_by_user_id
     LEFT JOIN app_users closed_u ON closed_u.id = ps.closed_by_user_id
     WHERE ps.branch_id = $1
       AND ps.closed_at IS NULL
     ORDER BY ps.opened_at DESC
     LIMIT 1`,
    [parseInt(branchId)]
  )

  return NextResponse.json({ session: rows[0] ?? null })
}

/**
 * POST /api/pos/sessions
 * Body: { branch_id, opening_balance, opened_by_user_id? }
 * Abre una nueva sesión de caja. Falla si ya hay una sesión activa.
 */
export async function POST(req: Request) {
  try {
    const { branch_id, opening_balance, opened_by_user_id } = await req.json()
    if (!branch_id)
      return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })

    // Verificar que no haya sesión abierta para esa sucursal
    const existing = await pool.query(
      `SELECT id FROM pos_sessions WHERE branch_id = $1 AND closed_at IS NULL LIMIT 1`,
      [parseInt(branch_id)]
    )
    if (existing.rows.length > 0)
      return NextResponse.json({ error: 'Ya hay una caja abierta para esta sucursal' }, { status: 409 })

    const { rows } = await pool.query(
      `INSERT INTO pos_sessions (branch_id, opening_balance, opened_by_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [parseInt(branch_id), parseFloat(opening_balance) || 0, opened_by_user_id ?? null]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    console.error('[POST /api/pos/sessions]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
