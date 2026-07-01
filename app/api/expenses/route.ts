import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getFopId, insertTransaction } from '@/lib/transactions'

/**
 * GET /api/expenses
 * Query: session_id?, branch_id?
 * Devuelve los gastos de la sesión o sucursal indicada.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  const branchId  = searchParams.get('branch_id')

  const conditions: string[] = []
  const params: (string | number)[] = []
  let p = 1

  if (sessionId) { conditions.push(`e.pos_session_id = $${p++}`); params.push(parseInt(sessionId)) }
  if (branchId)  { conditions.push(`e.branch_id = $${p++}`);      params.push(parseInt(branchId))  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await pool.query(`
    SELECT
      e.id,
      e.description,
      e.amount::float,
      e.payment_method,
      e.created_at,
      et.name  AS expense_type_name,
      u.name   AS user_name,
      br.name  AS branch_name
    FROM daily_expenses e
    LEFT JOIN expense_types et ON et.id = e.expense_type_id
    LEFT JOIN app_users u      ON u.id  = e.user_id
    LEFT JOIN branches  br     ON br.id = e.branch_id
    ${where}
    ORDER BY e.created_at DESC
  `, params)

  return NextResponse.json(rows)
}

/**
 * POST /api/expenses
 * Body: { pos_session_id?, branch_id, user_id?, expense_type_id?,
 *         description?, amount, payment_method }
 */
export async function POST(req: Request) {
  const client = await pool.connect()
  try {
    const {
      pos_session_id, branch_id, user_id, expense_type_id,
      description, amount, payment_method,
    } = await req.json()

    if (!branch_id) return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })
    if (!amount || isNaN(parseFloat(amount)))
      return NextResponse.json({ error: 'amount requerido y debe ser numérico' }, { status: 400 })

    const method = payment_method ?? 'efectivo'
    const branchIdNum = parseInt(branch_id)

    await client.query('BEGIN')

    const { rows } = await client.query(`
      INSERT INTO daily_expenses
        (pos_session_id, branch_id, user_id, expense_type_id,
         description, amount, payment_method)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, business_id, amount::float, payment_method, created_at
    `, [
      pos_session_id   ?? null,
      branchIdNum,
      user_id          ?? null,
      expense_type_id  ?? null,
      description?.trim() || null,
      parseFloat(amount),
      method,
    ])
    const expense = rows[0]

    const fopId = await getFopId(client, branchIdNum, method)
    if (fopId) {
      await insertTransaction(client, {
        businessId: expense.business_id,
        branchId:   branchIdNum,
        fopId,
        type:       'expense',
        typeId:     expense.id,
        amount:     -expense.amount,
      })
    }

    await client.query('COMMIT')
    return NextResponse.json(expense, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/expenses]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
