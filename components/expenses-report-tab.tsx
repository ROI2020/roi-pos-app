"use client"

import { useState, useEffect, useCallback, useMemo, Fragment } from "react"
import {
  Loader2, ChevronDown, ChevronRight, Search, Wallet, Landmark,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

// ── Types ──────────────────────────────────────────────────────────────────────
interface ExpenseRow {
  id:                number
  created_at:        string
  branch_id:         number
  branch_name:       string
  expense_type_id:   number | null
  expense_type_name: string
  description:       string | null
  amount:            number
  payment_method:    string
  fop_name:          string | null
  account_name:      string | null
  user_id:           number | null
  user_name:         string | null
}

interface Props {
  fromYMD: string
  toYMD:   string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const ACCOUNT_ICON: Record<string, React.ElementType> = {
  'Efectivo Caja Sucursal': Wallet,
  'Caja Central':           Wallet,
  'Mercado Pago MC':        Landmark,
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ExpensesReportTab({ fromYMD, toYMD }: Props) {
  const [rows,         setRows        ] = useState<ExpenseRow[]>([])
  const [loading,      setLoading     ] = useState(false)
  const [search,       setSearch      ] = useState('')
  const [expandedType, setExpandedType] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch(`/api/reports/expenses?from=${fromYMD}&to=${toYMD}`).then(r => r.json())
      setRows(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    finally  { setLoading(false) }
  }, [fromYMD, toYMD])

  useEffect(() => { load() }, [load])

  // ── Búsqueda (cualquier columna) ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => {
      const haystack = [
        r.expense_type_name, r.description, r.branch_name,
        r.account_name, r.fop_name, r.user_name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, search])

  // ── Desglose por fop / cuenta ─────────────────────────────────────────────
  type AccountBreakdown = { name: string; count: number; total: number }
  const accountBreakdown = useMemo<AccountBreakdown[]>(() => {
    const map = new Map<string, AccountBreakdown>()
    for (const r of filtered) {
      const name = r.account_name ?? 'Sin asignar'
      const b = map.get(name) ?? { name, count: 0, total: 0 }
      b.count++
      b.total += r.amount
      map.set(name, b)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  // ── Agrupado por Tipo de Gasto ────────────────────────────────────────────
  type Group = { key: string; typeName: string; count: number; total: number; rows: ExpenseRow[] }
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const r of filtered) {
      const key = r.expense_type_name
      const g = map.get(key) ?? { key, typeName: key, count: 0, total: 0, rows: [] }
      g.count++
      g.total += r.amount
      g.rows.push(r)
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  const grandTotal = useMemo(() => ({
    count: groups.reduce((s, g) => s + g.count, 0),
    total: groups.reduce((s, g) => s + g.total, 0),
  }), [groups])

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por tipo, descripción, sucursal, cuenta, usuario…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} gasto{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" /> Cargando gastos…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
          <p className="font-medium text-gray-500">Sin gastos en este período</p>
        </div>
      ) : (
        <>
          {/* Desglose por forma de pago / cuenta */}
          <div className="bg-white rounded-xl border shadow-sm p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Desglose por cuenta
            </p>
            <div className="flex flex-wrap gap-2">
              {accountBreakdown.map(b => {
                const Icon = ACCOUNT_ICON[b.name] ?? Wallet
                return (
                  <Badge
                    key={b.name} variant="outline"
                    className="text-xs gap-1.5 py-1.5 px-2.5 border-gray-300 text-gray-700 bg-gray-50"
                  >
                    <Icon className="h-3 w-3 text-violet-500" />
                    {b.name}
                    <span className="text-gray-400">({b.count})</span>
                    <span className="font-semibold text-red-600">{fmt(b.total)}</span>
                  </Badge>
                )
              })}
            </div>
          </div>

          {/* Agrupado por tipo de gasto */}
          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-2 py-2.5 text-left w-6" />
                  <th className="px-3 py-2.5 text-left">Tipo de gasto</th>
                  <th className="px-3 py-2.5 text-right">Cantidad</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {groups.map(g => {
                  const isOpen = expandedType === g.key
                  return (
                    <Fragment key={g.key}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedType(isOpen ? null : g.key)}
                      >
                        <td className="px-2 py-2.5 text-gray-400">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-700">{g.typeName}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{g.count}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-red-600">
                          {fmt(g.total)}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={4} className="bg-gray-50/60 px-4 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                                  <th className="text-left  pb-2 pr-3">Fecha</th>
                                  <th className="text-left  pb-2 pr-3">Sucursal</th>
                                  <th className="text-left  pb-2 pr-3">Descripción</th>
                                  <th className="text-left  pb-2 pr-3">Cuenta</th>
                                  <th className="text-left  pb-2 pr-3">Usuario</th>
                                  <th className="text-right pb-2">Importe</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {[...g.rows]
                                  .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                  .map(r => (
                                  <tr key={r.id}>
                                    <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">
                                      {fmtDate(r.created_at)} {fmtTime(r.created_at)}
                                    </td>
                                    <td className="py-1.5 pr-3 text-gray-600">{r.branch_name}</td>
                                    <td className="py-1.5 pr-3 text-gray-700">{r.description || '—'}</td>
                                    <td className="py-1.5 pr-3 text-gray-500">{r.account_name ?? '—'}</td>
                                    <td className="py-1.5 pr-3 text-gray-500">{r.user_name ?? '—'}</td>
                                    <td className="py-1.5 text-right font-medium tabular-nums text-red-600">
                                      {fmt(r.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-100 font-semibold text-sm">
                  <td colSpan={2} className="px-4 py-2.5 text-gray-700">TOTAL</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{grandTotal.count}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-600">
                    {fmt(grandTotal.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
