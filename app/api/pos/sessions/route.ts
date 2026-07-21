import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

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
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get('branch_id')
  if (!branchId) return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })

  // ?recent=true → devuelve las últimas sesiones CERRADAS (sin el resumen pesado)
  if (searchParams.get('recent') === 'true') {
    const { rows } = await pool.query(
      `SELECT ps.id, ps.branch_id, ps.opened_at, ps.closed_at, br.name AS branch_name
         FROM pos_sessions ps
         LEFT JOIN branches br ON br.id = ps.branch_id
        WHERE ps.branch_id = $1
          AND ps.business_id = $2
          AND ps.closed_at IS NOT NULL
        ORDER BY ps.opened_at DESC
        LIMIT 5`,
      [parseInt(branchId), businessId]
    )
    return NextResponse.json({ sessions: rows })
  }

  const { rows } = await pool.query(
    `SELECT
       ps.*,

       -- ── Ventas del turno ──────────────────────────────────────────────
       (SELECT COUNT(*)::int          FROM sales s WHERE s.pos_session_id = ps.id)           AS sales_count,
       (SELECT COALESCE(SUM(s.total_amount),0)::float FROM sales s WHERE s.pos_session_id = ps.id) AS sales_total,
       -- Totales por método: sin split → usa total_amount; con split → usa el monto del split
       (SELECT COALESCE(SUM(CASE WHEN s.payment_split IS NULL THEN s.total_amount ELSE COALESCE((s.payment_split->>'efectivo')::numeric,0) END),0)::float
        FROM sales s WHERE s.pos_session_id = ps.id AND (s.payment_method='efectivo' OR s.payment_split ? 'efectivo')) AS cash_total,
       (SELECT COALESCE(SUM(CASE WHEN s.payment_split IS NULL THEN s.total_amount ELSE COALESCE((s.payment_split->>'debito')::numeric,0) END),0)::float
        FROM sales s WHERE s.pos_session_id = ps.id AND (s.payment_method='debito' OR s.payment_split ? 'debito')) AS debit_total,
       (SELECT COALESCE(SUM(CASE WHEN s.payment_split IS NULL THEN s.total_amount ELSE COALESCE((s.payment_split->>'credito')::numeric,0) END),0)::float
        FROM sales s WHERE s.pos_session_id = ps.id AND (s.payment_method='credito' OR s.payment_split ? 'credito')) AS credit_total,
       (SELECT COALESCE(SUM(CASE WHEN s.payment_split IS NULL THEN s.total_amount ELSE COALESCE((s.payment_split->>'mp')::numeric,0) END),0)::float
        FROM sales s WHERE s.pos_session_id = ps.id AND (s.payment_method='mp' OR s.payment_split ? 'mp')) AS mp_total,
       (SELECT COALESCE(SUM(CASE WHEN s.payment_split IS NULL THEN s.total_amount ELSE COALESCE((s.payment_split->>'transferencia')::numeric,0) END),0)::float
        FROM sales s WHERE s.pos_session_id = ps.id AND (s.payment_method='transferencia' OR s.payment_split ? 'transferencia')) AS transfer_total,

       -- ── Retiros a Caja Central del turno ─────────────────────────────
       (SELECT COALESCE(SUM(ct.amount),0)::float FROM cash_transfers ct WHERE ct.pos_session_id = ps.id) AS withdrawal_total,

       -- ── Gastos del turno ──────────────────────────────────────────────
       (SELECT COUNT(*)::int          FROM daily_expenses e WHERE e.pos_session_id = ps.id)           AS expense_count,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id) AS expense_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'efectivo')      AS expense_cash_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'debito')        AS expense_debit_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'credito')       AS expense_credit_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'mp')            AS expense_mp_total,
       (SELECT COALESCE(SUM(e.amount),0)::float FROM daily_expenses e WHERE e.pos_session_id = ps.id AND e.payment_method = 'transferencia') AS expense_transfer_total,

       -- ── Ventas agrupadas por vendedor ─────────────────────────────────
       (SELECT json_agg(
          json_build_object(
            'user_id',     ub.uid,
            'user_name',   ub.uname,
            'sales_count', ub.cnt,
            'sales_total', ub.tot
          ) ORDER BY ub.tot DESC
        ) FROM (
          SELECT s.user_id AS uid,
                 COALESCE(u2.name, 'Sin usuario') AS uname,
                 COUNT(*)::int                    AS cnt,
                 SUM(s.total_amount)::float       AS tot
          FROM sales s
          LEFT JOIN app_users u2 ON u2.id = s.user_id
          WHERE s.pos_session_id = ps.id
          GROUP BY s.user_id, u2.name
        ) ub) AS sales_by_user,

       -- ── Nombres de sucursal y usuarios ────────────────────────────────
       br.name                    AS branch_name,
       opened_u.name              AS opened_by_user_name,
       closed_u.name              AS closed_by_user_name

     FROM pos_sessions ps
     LEFT JOIN branches  br       ON br.id       = ps.branch_id
     LEFT JOIN app_users opened_u ON opened_u.id = ps.opened_by_user_id
     LEFT JOIN app_users closed_u ON closed_u.id = ps.closed_by_user_id
     WHERE ps.branch_id = $1
       AND ps.business_id = $2
       AND ps.closed_at IS NULL
     ORDER BY ps.opened_at DESC
     LIMIT 1`,
    [parseInt(branchId), businessId]
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
    const bizResult = await requireBusinessId()
    if (bizResult instanceof NextResponse) return bizResult
    const { businessId } = bizResult

    const { branch_id, opening_balance, opened_by_user_id } = await req.json()
    if (!branch_id)
      return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })

    // Verificar que no haya sesión abierta para esa sucursal
    const existing = await pool.query(
      `SELECT id FROM pos_sessions WHERE branch_id = $1 AND business_id = $2 AND closed_at IS NULL LIMIT 1`,
      [parseInt(branch_id), businessId]
    )
    if (existing.rows.length > 0)
      return NextResponse.json({ error: 'Ya hay una caja abierta para esta sucursal' }, { status: 409 })

    const { rows } = await pool.query(
      `INSERT INTO pos_sessions (business_id, branch_id, opening_balance, opened_by_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [businessId, parseInt(branch_id), parseFloat(opening_balance) || 0, opened_by_user_id ?? null]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    console.error('[POST /api/pos/sessions]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
