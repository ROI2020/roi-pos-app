// Mapeo de nombre de fop -> token interno de payment_method, usado por la UI
// del POS para decidir qué formas de pago mostrar según `fops.use_for_sales`.
// Espejo (client-side) de PAYMENT_FOP_MAP en lib/transactions.ts — si se agrega
// una forma de pago nueva, actualizar ambos.
export type PayMethod = 'efectivo' | 'debito' | 'credito' | 'mp' | 'transferencia'

const FOP_NAME_TO_METHOD: Record<string, PayMethod> = {
  Efectivo:      'efectivo',
  Debito:        'debito',
  Credito:       'credito',
  QR:            'mp',
  Transferencia: 'transferencia',
}

interface AccountWithFops {
  branch_id: number | null
  fops: { name: string; use_for_sales: boolean }[]
}

/**
 * Devuelve el conjunto de PayMethod habilitados (use_for_sales = true)
 * para las cuentas de la sucursal dada.
 */
export async function fetchEnabledPaymentMethods(branchId: number): Promise<Set<PayMethod>> {
  const accounts: AccountWithFops[] = await fetch('/api/accounts').then(r => r.json())
  const enabled = new Set<PayMethod>()
  accounts
    .filter(a => a.branch_id === branchId)
    .forEach(a => a.fops.forEach(f => {
      const method = FOP_NAME_TO_METHOD[f.name]
      if (f.use_for_sales && method) enabled.add(method)
    }))
  return enabled
}
