import type { PoolClient } from 'pg'

/**
 * Mapeo forma de pago → cuenta/fop, igual al usado en el backfill histórico
 * (database/migrate.sql). Única fuente de verdad para que las rutas de
 * creación (sales/expenses/exchanges/cash-transfers/purchases) y la
 * migración queden siempre consistentes.
 */
const PAYMENT_FOP_MAP: Record<string, { accountName: string; fopName: string }> = {
  efectivo:      { accountName: 'Efectivo Caja Sucursal', fopName: 'Efectivo' },
  debito:        { accountName: 'Mercado Pago MC',        fopName: 'Debito' },
  credito:       { accountName: 'Mercado Pago MC',        fopName: 'Credito' },
  mp:            { accountName: 'Mercado Pago MC',        fopName: 'QR' },
  transferencia: { accountName: 'Mercado Pago MC',        fopName: 'Transferencia' },
}

/**
 * Resuelve el fop_id correspondiente a una forma de pago en una sucursal
 * (branchId = null → Caja Central, siempre vía la cuenta "Efectivo Caja
 * Central" / fop "Efectivo").
 */
export async function getFopId(
  client: PoolClient, branchId: number | null, paymentMethod: string
): Promise<number | null> {
  const map = PAYMENT_FOP_MAP[paymentMethod]
  if (!map) return null

  const accountName = branchId === null ? 'Efectivo Caja Central' : map.accountName
  const fopName      = branchId === null ? 'Efectivo'              : map.fopName

  const { rows } = await client.query(
    `SELECT f.id
       FROM fops f
       JOIN accounts a ON a.id = f.account_id
      WHERE a.name = $1 AND a.branch_id IS NOT DISTINCT FROM $2 AND f.name = $3`,
    [accountName, branchId, fopName]
  )
  return rows[0]?.id ?? null
}

export async function insertTransaction(
  client: PoolClient,
  params: {
    businessId: number
    branchId:   number | null
    fopId:      number
    type:       'sale' | 'purchase' | 'exchange' | 'expense' | 'transfer' | 'online'
    typeId:     number
    amount:     number
    currency?:  string   // ISO 4217 — default 'ARS' para negocios ARG existentes
  }
) {
  const currency = params.currency ?? 'ARS'
  await client.query(
    `INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [params.businessId, params.branchId, params.fopId, params.type, params.typeId, currency, params.amount]
  )
}

/**
 * Inserta una o varias transactions para una venta, según tenga forma de
 * pago única o combinada (payment_split). amountByMethod ya viene resuelto
 * (un solo método con el total, o el split completo).
 *
 * Retorna true si se insertó al menos una fila; false si ningún método
 * tuvo fop_id resuelto (cuenta no configurada en esa sucursal).
 * En ese caso loguea un warning para facilitar el diagnóstico.
 */
export async function insertSaleTransactions(
  client: PoolClient,
  params: {
    businessId: number
    branchId:   number
    saleId:     number
    amountByMethod: Record<string, number>
    currency?:  string   // ISO 4217 — default 'ARS' para negocios ARG existentes
  }
): Promise<boolean> {
  let inserted = false
  for (const [method, amount] of Object.entries(params.amountByMethod)) {
    if (!amount) continue
    const fopId = await getFopId(client, params.branchId, method)
    if (!fopId) {
      console.warn(
        `[insertSaleTransactions] fop_id no encontrado para método='${method}' ` +
        `branchId=${params.branchId} — transaction omitida para sale #${params.saleId}`
      )
      continue
    }
    await insertTransaction(client, {
      businessId: params.businessId,
      branchId:   params.branchId,
      fopId,
      type:       'sale',
      typeId:     params.saleId,
      amount,
      currency:   params.currency,
    })
    inserted = true
  }
  return inserted
}
