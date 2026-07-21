import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getFopId, insertTransaction } from '@/lib/transactions'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * PATCH /api/expenses/[id]
 * Body (todos opcionales): { expense_type_id?, description?, amount?, payment_method?, user_id? }
 * Actualiza el gasto y, si cambiaron amount o payment_method, re-escribe la fila en transactions.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bizResult = await requireBusinessId()
  if (bizResult instanceof NextResponse) return bizResult
  const { businessId } = bizResult

  const { id: idStr } = await params
  const id = parseInt(idStr)
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>
  const { expense_type_id, description, amount, payment_method, user_id } = body

  if (amount !== undefined) {
    const amt = parseFloat(String(amount))
    if (isNaN(amt) || amt <= 0)
      return NextResponse.json({ error: 'El monto debe ser un número positivo' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Construir SET dinámico ──────────────────────────────────────────────
    const sets: string[] = []
    const vals: unknown[] = []
    let p = 1

    if (expense_type_id !== undefined) { sets.push(`expense_type_id = $${p++}`); vals.push(expense_type_id ? parseInt(String(expense_type_id)) : null) }
    if (description     !== undefined) { sets.push(`description = $${p++}`);      vals.push(String(description).trim() || null) }
    if (amount          !== undefined) { sets.push(`amount = $${p++}`);            vals.push(parseFloat(String(amount))) }
    if (payment_method  !== undefined) { sets.push(`payment_method = $${p++}`);   vals.push(payment_method) }
    if (user_id         !== undefined) { sets.push(`user_id = $${p++}`);           vals.push(user_id ? parseInt(String(user_id)) : null) }

    if (sets.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
    }

    vals.push(id)
    vals.push(businessId)
    const { rows } = await client.query(
      `UPDATE daily_expenses
          SET ${sets.join(', ')}
        WHERE id = $${p} AND business_id = $${p + 1}
        RETURNING id, business_id, branch_id, amount::float, payment_method`,
      vals
    )

    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
    }

    const expense = rows[0]

    // ── Re-escribir transaction solo si cambió el importe o la forma de pago ─
    if (amount !== undefined || payment_method !== undefined) {
      await client.query(
        `DELETE FROM transactions WHERE type = 'expense' AND type_id = $1`,
        [id]
      )

      const fopId = await getFopId(client, expense.branch_id, expense.payment_method)
      if (!fopId) {
        await client.query('ROLLBACK')
        console.error(`[PATCH /api/expenses/${id}] fopId not found — branch=${expense.branch_id} method=${expense.payment_method}`)
        return NextResponse.json(
          { error: `No se encontró la cuenta/FOP (sucursal=${expense.branch_id}, método=${expense.payment_method}). Verificá la configuración de cuentas.` },
          { status: 422 }
        )
      }

      await insertTransaction(client, {
        businessId: expense.business_id,
        branchId:   expense.branch_id,
        fopId,
        type:       'expense',
        typeId:     expense.id,
        amount:     -expense.amount,
      })
    }

    await client.query('COMMIT')
    return NextResponse.json(expense)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(`[PATCH /api/expenses/${id}]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
