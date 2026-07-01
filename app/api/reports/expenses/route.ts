import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

/**
 * GET /api/reports/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Gastos diarios del período, con la cuenta/fop real a la que impactaron
 * (vía transactions) en lugar de re-derivar el mapeo payment_method→cuenta
 * en el frontend.
 */
export async function GET(req: Request) {
  const blocked = await requireFeature('expenses.view')
  if (blocked) return blocked

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to) return NextResponse.json({ error: 'from y to son requeridos (YYYY-MM-DD)' }, { status: 400 })

  const { rows } = await pool.query(
    `SELECT
       de.id,
       de.created_at,
       de.branch_id,
       br.name                          AS branch_name,
       de.expense_type_id,
       COALESCE(et.name, 'Otros')       AS expense_type_name,
       de.description,
       de.amount::float                 AS amount,
       de.payment_method,
       f.name                           AS fop_name,
       a.name                           AS account_name,
       de.user_id,
       u.name                           AS user_name
     FROM daily_expenses de
     JOIN branches br            ON br.id = de.branch_id
     LEFT JOIN expense_types et  ON et.id = de.expense_type_id
     LEFT JOIN app_users u       ON u.id  = de.user_id
     LEFT JOIN transactions t    ON t.type = 'expense' AND t.type_id = de.id
     LEFT JOIN fops f            ON f.id  = t.fop_id
     LEFT JOIN accounts a        ON a.id  = f.account_id
     WHERE de.created_at::date BETWEEN $1::date AND $2::date
     ORDER BY de.created_at DESC`,
    [from, to]
  )

  return NextResponse.json(rows)
}
