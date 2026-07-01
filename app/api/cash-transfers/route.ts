import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getFopId, insertTransaction } from '@/lib/transactions'

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

  const branchIdNum = parseInt(from_branch_id)
  const amountNum   = parseFloat(amount)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [row] } = await client.query(
      `INSERT INTO cash_transfers (pos_session_id, from_branch_id, amount, notes, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, business_id, created_at`,
      [pos_session_id ?? null, branchIdNum, amountNum, notes?.trim() || null, user_id ?? null]
    )

    // Dos patas: sale de la sucursal (negativo) y entra a Caja Central (positivo)
    const branchFopId  = await getFopId(client, branchIdNum, 'efectivo')
    const centralFopId = await getFopId(client, null, 'efectivo')
    if (branchFopId) {
      await insertTransaction(client, {
        businessId: row.business_id, branchId: branchIdNum, fopId: branchFopId,
        type: 'transfer', typeId: row.id, amount: -amountNum,
      })
    }
    if (centralFopId) {
      await insertTransaction(client, {
        businessId: row.business_id, branchId: null, fopId: centralFopId,
        type: 'transfer', typeId: row.id, amount: amountNum,
      })
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/cash-transfers]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
