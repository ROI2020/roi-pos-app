"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Loader2, ChevronDown, ChevronRight, Wallet, Landmark, Building2,
  TrendingUp, TrendingDown, RefreshCw, ArrowDownUp, ShoppingBag,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Account {
  id:           number
  name:         string
  type:         string
  currency:     string
  branch_id:    number | null
  branch_name:  string
  balance:      number
}

interface LedgerEntry {
  id:           number
  created_at:   string
  type:         'sale' | 'expense' | 'exchange' | 'transfer' | 'purchase'
  type_id:      number
  amount:       number
  fop_name:     string
  description:  string
  user_name:    string | null
}

interface Props {
  fromYMD: string
  toYMD:   string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const TYPE_CONFIG: Record<LedgerEntry['type'], { label: string; Icon: React.ElementType; color: string }> = {
  sale:     { label: 'Venta',   Icon: TrendingUp,   color: 'text-green-700'  },
  expense:  { label: 'Gasto',   Icon: TrendingDown, color: 'text-red-600'    },
  exchange: { label: 'Cambio',  Icon: RefreshCw,    color: 'text-violet-700' },
  transfer: { label: 'Mov.',    Icon: ArrowDownUp,  color: 'text-amber-700'  },
  purchase: { label: 'Compra',  Icon: ShoppingBag,  color: 'text-orange-700' },
}

const ACCOUNT_ICON: Record<string, React.ElementType> = {
  efectivo:    Wallet,
  mercadopago: Landmark,
}

// ══════════════════════════════════════════════════════════════════════════════
export default function AccountsReportTab({ fromYMD, toYMD }: Props) {
  const [accounts,      setAccounts     ] = useState<Account[]>([])
  const [loadingAccts,  setLoadingAccts ] = useState(false)
  const [expandedId,    setExpandedId   ] = useState<number | null>(null)
  const [ledger,        setLedger       ] = useState<LedgerEntry[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoadingAccts(true)
    try {
      const data = await fetch('/api/reports/accounts').then(r => r.json())
      setAccounts(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    finally  { setLoadingAccts(false) }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const loadLedger = useCallback(async (accountId: number) => {
    setLoadingLedger(true)
    try {
      const data = await fetch(`/api/reports/accounts/ledger?account_id=${accountId}&from=${fromYMD}&to=${toYMD}`).then(r => r.json())
      setLedger(Array.isArray(data) ? data : [])
    } catch { setLedger([]) }
    finally  { setLoadingLedger(false) }
  }, [fromYMD, toYMD])

  const toggle = (accountId: number) => {
    if (expandedId === accountId) {
      setExpandedId(null)
      setLedger([])
    } else {
      setExpandedId(accountId)
      loadLedger(accountId)
    }
  }

  // Si la solapa está abierta sobre una cuenta y cambia el rango de fechas, recargar su libro mayor
  useEffect(() => {
    if (expandedId !== null) loadLedger(expandedId)
  }, [fromYMD, toYMD]) // eslint-disable-line react-hooks/exhaustive-deps

  const grandTotal = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts])

  // Agrupar cuentas por sucursal (Caja Central al final)
  const grouped = useMemo(() => {
    const map = new Map<string, { branchName: string; accounts: Account[] }>()
    for (const a of accounts) {
      const key = a.branch_id === null ? '__central__' : String(a.branch_id)
      const g = map.get(key) ?? { branchName: a.branch_name, accounts: [] }
      g.accounts.push(a)
      map.set(key, g)
    }
    return [...map.entries()]
      .sort(([ka], [kb]) => ka === '__central__' ? 1 : kb === '__central__' ? -1 : ka.localeCompare(kb))
      .map(([, g]) => g)
  }, [accounts])

  return (
    <div className="space-y-6">
      {loadingAccts && accounts.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" /> Cargando cuentas…
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
          <p className="font-medium text-gray-500">No hay cuentas configuradas</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(g => (
            <div key={g.branchName}>
              <div className="flex items-center gap-1.5 mb-2">
                {g.branchName === 'Caja Central'
                  ? <Building2 className="h-3.5 w-3.5 text-gray-400" />
                  : <span className="text-sm">📍</span>}
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{g.branchName}</p>
              </div>

              <div className="bg-white rounded-xl border shadow-sm divide-y divide-gray-50">
                {g.accounts.map(a => {
                  const isOpen = expandedId === a.id
                  const Icon = ACCOUNT_ICON[a.type] ?? Wallet
                  return (
                    <div key={a.id}>
                      <div
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggle(a.id)}
                      >
                        {isOpen
                          ? <ChevronDown  className="h-4 w-4 text-gray-400 shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                        <Icon className="h-4 w-4 text-violet-500 shrink-0" />
                        <span className="font-medium text-gray-800 flex-1">{a.name}</span>
                        <span className={`font-semibold tabular-nums ${a.balance > 0 ? 'text-green-700' : a.balance < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {fmt(a.balance)}
                        </span>
                      </div>

                      {isOpen && (
                        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                          {loadingLedger ? (
                            <div className="flex items-center justify-center gap-2 text-gray-400 py-6 text-sm">
                              <Loader2 className="h-4 w-4 animate-spin" /> Cargando movimientos…
                            </div>
                          ) : ledger.length === 0 ? (
                            <p className="text-center text-gray-400 text-sm py-6">Sin movimientos en este período</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                    <th className="text-left  pb-2 pr-3">Fecha</th>
                                    <th className="text-left  pb-2 pr-3">Tipo</th>
                                    <th className="text-left  pb-2 pr-3">Descripción</th>
                                    <th className="text-left  pb-2 pr-3">Forma de pago</th>
                                    <th className="text-left  pb-2 pr-3">Usuario</th>
                                    <th className="text-right pb-2">Importe</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {ledger.map(e => {
                                    const cfg = TYPE_CONFIG[e.type]
                                    return (
                                      <tr key={e.id}>
                                        <td className="py-1.5 pr-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                                        <td className="py-1.5 pr-3">
                                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                                            <cfg.Icon className="h-3 w-3" /> {cfg.label}
                                          </span>
                                        </td>
                                        <td className="py-1.5 pr-3 text-gray-700">{e.description}</td>
                                        <td className="py-1.5 pr-3 text-xs text-gray-500">{e.fop_name}</td>
                                        <td className="py-1.5 pr-3 text-xs text-gray-500">{e.user_name ?? '—'}</td>
                                        <td className={`py-1.5 text-right font-medium tabular-nums ${e.amount > 0 ? 'text-green-700' : 'text-red-600'}`}>
                                          {fmt(e.amount)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-gray-200 font-semibold">
                                    <td colSpan={5} className="pt-2 text-gray-600 text-xs">Movimiento del período</td>
                                    <td className="pt-2 text-right tabular-nums">
                                      {fmt(ledger.reduce((s, e) => s + e.amount, 0))}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between px-4 py-3 bg-gray-100 rounded-xl border font-semibold">
            <span className="text-gray-700">Saldo total</span>
            <span className={`tabular-nums ${grandTotal >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(grandTotal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
