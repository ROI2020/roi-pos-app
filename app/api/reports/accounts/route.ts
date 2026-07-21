import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/reports/accounts
 *
 * Lista de cuentas con su saldo actual, calculado en vivo sumando
 * transactions.amount (vía fops.account_id) — nunca se persiste un
 * saldo, así que no puede desincronizarse de la realidad.
 */
export async function GET() {
  const blocked = await requireFeature('finance.transactions')
  if (blocked) return blocked

  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query(`
    SELECT
      a.id,
      a.name,
      a.type,
      a.currency,
      a.branch_id,
      COALESCE(br.name, 'Caja Central') AS branch_name,
      COALESCE(SUM(t.amount), 0)::float AS balance
    FROM accounts a
    LEFT JOIN branches br     ON br.id = a.branch_id
    LEFT JOIN fops f          ON f.account_id = a.id
    LEFT JOIN transactions t  ON t.fop_id = f.id
    WHERE a.business_id = $1
    GROUP BY a.id, a.name, a.type, a.currency, a.branch_id, br.name
    ORDER BY a.branch_id NULLS LAST, a.name
  `, [businessId])

  return NextResponse.json(rows)
}
