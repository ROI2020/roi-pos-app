import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

/**
 * GET /api/reports/accounts/ledger?account_id=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Libro mayor de una cuenta: todos los movimientos (transactions) en el
 * rango de fechas, con una descripción legible armada según el tipo de
 * origen (sale/expense/exchange/transfer/purchase).
 */
export async function GET(req: Request) {
  const blocked = await requireFeature('finance.transactions')
  if (blocked) return blocked

  const { searchParams } = new URL(req.url)
  const accountId = parseInt(searchParams.get('account_id') ?? '')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!accountId) return NextResponse.json({ error: 'account_id requerido' }, { status: 400 })
  if (!from || !to) return NextResponse.json({ error: 'from y to son requeridos (YYYY-MM-DD)' }, { status: 400 })

  const { rows } = await pool.query(
    `SELECT
       t.id,
       t.created_at,
       t.type,
       t.type_id,
       t.amount::float AS amount,
       f.name           AS fop_name,
       CASE t.type
         WHEN 'sale' THEN
           COALESCE(NULLIF(s.invoice_number, ''), CONCAT('Venta #', s.id))
         WHEN 'expense' THEN
           TRIM(CONCAT(
             COALESCE(et.name, 'Gasto'),
             CASE WHEN de.description IS NOT NULL AND de.description <> ''
               THEN ': ' || de.description ELSE '' END
           ))
         WHEN 'exchange' THEN
           CONCAT(
             COALESCE(rp.name,'?'), ' T.', COALESCE(rv.size,'?'),
             ' → ',
             COALESCE(np.name,'?'), ' T.', COALESCE(nv.size,'?')
           )
         WHEN 'transfer' THEN
           CASE WHEN t.branch_id IS NULL
             THEN 'Ingreso desde ' || COALESCE(tbr.name, 'sucursal')
             ELSE 'Retiro a Caja Central'
           END
         WHEN 'purchase' THEN
           COALESCE('Compra a ' || sup.company_name, CONCAT('Compra #', p.id))
       END              AS description,
       COALESCE(uv.name, ue.name, ux.name, ut.name) AS user_name
     FROM transactions t
     JOIN fops f                  ON f.id = t.fop_id
     LEFT JOIN sales s            ON t.type = 'sale'     AND s.id  = t.type_id
     LEFT JOIN app_users uv       ON uv.id = s.user_id
     LEFT JOIN daily_expenses de  ON t.type = 'expense'   AND de.id = t.type_id
     LEFT JOIN expense_types et   ON et.id = de.expense_type_id
     LEFT JOIN app_users ue       ON ue.id = de.user_id
     LEFT JOIN exchanges ex       ON t.type = 'exchange'  AND ex.id = t.type_id
     LEFT JOIN app_users ux       ON ux.id = ex.user_id
     LEFT JOIN product_variants rv ON rv.id = ex.returned_variant_id
     LEFT JOIN products          rp ON rp.id = rv.product_id
     LEFT JOIN product_variants nv ON nv.id = ex.new_variant_id
     LEFT JOIN products          np ON np.id = nv.product_id
     LEFT JOIN cash_transfers ct  ON t.type = 'transfer'  AND ct.id = t.type_id
     LEFT JOIN app_users ut       ON ut.id = ct.user_id
     LEFT JOIN branches tbr       ON tbr.id = ct.from_branch_id
     LEFT JOIN purchases p        ON t.type = 'purchase'  AND p.id = t.type_id
     LEFT JOIN suppliers sup      ON sup.id = p.supplier_id
     WHERE f.account_id = $1
       AND t.created_at::date BETWEEN $2::date AND $3::date
     ORDER BY t.created_at DESC`,
    [accountId, from, to]
  )

  return NextResponse.json(rows)
}
