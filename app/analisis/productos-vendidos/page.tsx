'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  ShoppingBag, ChevronDown, ChevronRight, Loader2,
  TrendingUp, Banknote, BadgeDollarSign, AlertTriangle, Pencil, Check, X,
  Globe, Package,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { DateRangeFilter, useDateRange } from '@/components/date-range-filter'
import { useAdminCurrency } from '@/hooks/use-admin-currency'

// ── Tipos POS ──────────────────────────────────────────────────────────────────
interface ProductRow {
  category:      string
  gender:        string
  product_id:    number
  product_name:  string
  stock_actual:  number
  qty_sold:      number
  gross_revenue: number   // venta bruta (sin descuento)
  discount:      number   // descuento proporcional
  revenue:       number   // venta NETA — base para márgenes
  cost:          number
}

interface CategoryGroup {
  category:      string
  stock_actual:  number
  qty_sold:      number
  gross_revenue: number
  discount:      number
  revenue:       number   // neta
  cost:          number
  margin:        number
  marginPct:     number
  products:      (ProductRow & { margin: number; marginPct: number })[]
}

// ── Tipos Online ───────────────────────────────────────────────────────────────
interface OnlineProductRow {
  category:     string
  gender:       string
  product_id:   number
  product_name: string
  is_cj:        boolean
  qty_sold:     number
  revenue:      number
}

interface OnlineCategoryGroup {
  category:  string
  qty_sold:  number
  revenue:   number
  products:  OnlineProductRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtN   = (n: number) => new Intl.NumberFormat('es-AR').format(n)
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

function marginColor(pct: number) {
  if (pct >= 0.40) return 'text-emerald-600 font-semibold'
  if (pct >= 0.20) return 'text-amber-600'
  if (pct >  0)   return 'text-red-500'
  return 'text-gray-400'
}

// ── Editor de costo inline (solo aparece cuando cost = 0) ─────────────────────
function CostEditor({ productId, cost, qtySold, onUpdated, fmt }: {
  productId: number
  cost:      number
  qtySold:   number
  onUpdated: (newTotalCost: number) => void
  fmt:       (n: number) => string
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue  ] = useState('')
  const [saving,  setSaving ] = useState(false)

  // Costo conocido: solo mostrar
  if (cost > 0) return <span className="tabular-nums">{fmt(cost)}</span>

  const save = async () => {
    const parsed = parseFloat(value.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) { toast.error('Ingresá un costo unitario válido'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${productId}/cost`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ unit_cost: parsed }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdated(parsed * qtySold)
      setEditing(false)
      toast.success('Costo actualizado')
    } catch (err: unknown) { toast.error((err as Error).message) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="costo unit."
          className="w-24 h-6 text-xs text-right border border-violet-300 rounded px-1
                     focus:outline-none focus:ring-1 focus:ring-violet-400"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter')  save()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
        >
          {saving
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Check   className="h-3 w-3" />
          }
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1 justify-end group cursor-pointer"
      onClick={e => { e.stopPropagation(); setValue(''); setEditing(true) }}
      title="Costo $0 — hacé clic para ingresar el costo unitario"
    >
      <span className="text-amber-600 font-medium tabular-nums text-xs">$ 0</span>
      <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-violet-400 flex-shrink-0" />
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function ProductosVendidosPage() {
  const { fmt } = useAdminCurrency()
  const dateRange = useDateRange('month')

  // Tab activo: 'pos' | 'online'
  const [tab, setTab] = useState<'pos' | 'online'>('pos')

  // ── Estado POS ─────────────────────────────────────────────────────────────
  const [rows,     setRows    ] = useState<ProductRow[] | null>(null)
  const [loading,  setLoading ] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // ── Estado Online ──────────────────────────────────────────────────────────
  const [onlineRows,    setOnlineRows   ] = useState<OnlineProductRow[] | null>(null)
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [onlineExpanded, setOnlineExpanded] = useState<Set<string>>(new Set())

  // ── Fetch POS ──────────────────────────────────────────────────────────────
  const loadPos = useCallback(async (from: string, to: string) => {
    setLoading(true)
    setExpanded(new Set())
    try {
      const data = await fetch(
        `/api/reports/products-sold?from=${from}&to=${to}`
      ).then(r => r.json())
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) }
    finally  { setLoading(false) }
  }, [])

  // ── Fetch Online ───────────────────────────────────────────────────────────
  const loadOnline = useCallback(async (from: string, to: string) => {
    setOnlineLoading(true)
    setOnlineExpanded(new Set())
    try {
      const data = await fetch(
        `/api/reports/online-orders-sold?from=${from}&to=${to}`
      ).then(r => r.json())
      setOnlineRows(Array.isArray(data) ? data : [])
    } catch { setOnlineRows([]) }
    finally  { setOnlineLoading(false) }
  }, [])

  // Auto-fetch cuando cambia el rango o el tab
  useEffect(() => {
    if (tab === 'pos') {
      loadPos(dateRange.fromYMD, dateRange.toYMD)
    } else {
      loadOnline(dateRange.fromYMD, dateRange.toYMD)
    }
  }, [dateRange.fromYMD, dateRange.toYMD, tab, loadPos, loadOnline])

  // ── Agrupación POS por categoría ───────────────────────────────────────────
  const groups = useMemo((): CategoryGroup[] => {
    if (!rows) return []
    const map = new Map<string, CategoryGroup>()

    for (const r of rows) {
      const margin    = r.revenue - r.cost
      const marginPct = r.revenue > 0 ? margin / r.revenue : 0

      if (!map.has(r.category)) {
        map.set(r.category, {
          category: r.category,
          stock_actual: 0, qty_sold: 0, gross_revenue: 0, discount: 0,
          revenue: 0, cost: 0, margin: 0, marginPct: 0,
          products: [],
        })
      }
      const g = map.get(r.category)!
      g.stock_actual  += r.stock_actual
      g.qty_sold      += r.qty_sold
      g.gross_revenue += r.gross_revenue
      g.discount      += r.discount
      g.revenue       += r.revenue
      g.cost          += r.cost
      g.margin        += margin
      g.products.push({ ...r, margin, marginPct })
    }

    return [...map.values()]
      .map(g => ({
        ...g,
        marginPct: g.revenue > 0 ? g.margin / g.revenue : 0,
        products: g.products.sort((a, b) => b.margin - a.margin),
      }))
      .sort((a, b) => b.margin - a.margin)
  }, [rows])

  // ── Agrupación Online por categoría ───────────────────────────────────────
  const onlineGroups = useMemo((): OnlineCategoryGroup[] => {
    if (!onlineRows) return []
    const map = new Map<string, OnlineCategoryGroup>()

    for (const r of onlineRows) {
      if (!map.has(r.category)) {
        map.set(r.category, { category: r.category, qty_sold: 0, revenue: 0, products: [] })
      }
      const g = map.get(r.category)!
      g.qty_sold += r.qty_sold
      g.revenue  += r.revenue
      g.products.push(r)
    }

    return [...map.values()]
      .map(g => ({ ...g, products: g.products.sort((a, b) => b.revenue - a.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [onlineRows])

  // ── Totales POS ────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = groups.reduce(
      (acc, g) => ({
        qty:          acc.qty          + g.qty_sold,
        gross_revenue: acc.gross_revenue + g.gross_revenue,
        discount:     acc.discount     + g.discount,
        revenue:      acc.revenue      + g.revenue,
        cost:         acc.cost         + g.cost,
        margin:       acc.margin       + g.margin,
      }),
      { qty: 0, gross_revenue: 0, discount: 0, revenue: 0, cost: 0, margin: 0 }
    )
    return { ...t, marginPct: t.revenue > 0 ? t.margin / t.revenue : 0 }
  }, [groups])

  // ── Totales Online ─────────────────────────────────────────────────────────
  const onlineTotals = useMemo(() => {
    return onlineGroups.reduce(
      (acc, g) => ({ qty: acc.qty + g.qty_sold, revenue: acc.revenue + g.revenue }),
      { qty: 0, revenue: 0 }
    )
  }, [onlineGroups])

  const toggle = (cat: string) =>
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(cat) ? n.delete(cat) : n.add(cat)
      return n
    })

  const toggleOnline = (cat: string) =>
    setOnlineExpanded(prev => {
      const n = new Set(prev)
      n.has(cat) ? n.delete(cat) : n.add(cat)
      return n
    })

  const updateProductCost = (productId: number, newTotalCost: number) =>
    setRows(prev => prev?.map(r =>
      r.product_id === productId ? { ...r, cost: newTotalCost } : r
    ) ?? null)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Encabezado */}
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-violet-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Productos Vendidos</h1>
            <p className="text-sm text-gray-500">
              Rendimiento por categoría y producto en el período seleccionado
            </p>
          </div>
        </div>

        {/* Selector de fechas + Tab switcher */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <DateRangeFilter {...dateRange} />

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTab('pos')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'pos'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              POS
            </button>
            <button
              onClick={() => setTab('online')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'online'
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Online
            </button>
          </div>
        </div>

        {/* ══ TAB POS ══════════════════════════════════════════════════════════ */}
        {tab === 'pos' && (
          <>
            {/* KPIs */}
            {rows !== null && rows.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Unidades vendidas',
                    value: fmtN(totals.qty),
                    sub:   null,
                    Icon:  ShoppingBag,
                    color: 'text-violet-600 bg-violet-50',
                  },
                  {
                    label: 'Venta Neta',
                    value: fmt(totals.revenue),
                    sub:   totals.discount > 0
                      ? `Bruta ${fmt(totals.gross_revenue)} · Dto. ${fmt(totals.discount)}`
                      : null,
                    Icon:  Banknote,
                    color: 'text-sky-600 bg-sky-50',
                  },
                  {
                    label: 'Costo total',
                    value: fmt(totals.cost),
                    sub:   null,
                    Icon:  TrendingUp,
                    color: 'text-amber-600 bg-amber-50',
                  },
                  {
                    label: 'Margen total',
                    value: fmt(totals.margin),
                    sub:   `${fmtPct(totals.marginPct)} sobre venta neta`,
                    Icon:  BadgeDollarSign,
                    color: 'text-emerald-600 bg-emerald-50',
                  },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${c.color.split(' ')[1]} flex-shrink-0`}>
                      <c.Icon className={`h-5 w-5 ${c.color.split(' ')[0]}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 truncate">{c.label}</p>
                      <p className="text-base font-bold text-gray-900 truncate">{c.value}</p>
                      {c.sub && (
                        <p className="text-xs text-gray-400 truncate">{c.sub}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Estado cargando */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              </div>
            )}

            {/* Estado vacío */}
            {!loading && rows !== null && rows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                <ShoppingBag className="h-10 w-10" />
                <p className="text-sm">No hay ventas POS en el período seleccionado</p>
              </div>
            )}

            {/* Tabla POS */}
            {!loading && groups.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="w-8 px-3 py-3" />
                        <th className="px-3 py-3 text-left">Categoría</th>
                        <th className="px-3 py-3 text-left">Género</th>
                        <th className="px-3 py-3 text-left">Producto</th>
                        <th className="px-3 py-3 text-right">Stock</th>
                        <th className="px-3 py-3 text-right">Vendido</th>
                        <th className="px-3 py-3 text-right">Bruta</th>
                        <th className="px-3 py-3 text-right text-red-400">Dto.</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Venta Neta</th>
                        <th className="px-3 py-3 text-right">Costo</th>
                        <th className="px-3 py-3 text-right">Margen</th>
                        <th className="px-3 py-3 text-right text-gray-400">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groups.map(g => {
                        const open = expanded.has(g.category)
                        return (
                          <React.Fragment key={`group-${g.category}`}>
                            {/* ── Fila de categoría ── */}
                            <tr
                              className="bg-gray-50/70 hover:bg-gray-100/60 cursor-pointer select-none transition-colors"
                              onClick={() => toggle(g.category)}
                            >
                              <td className="px-3 py-3 text-gray-400">
                                {open
                                  ? <ChevronDown  className="h-4 w-4" />
                                  : <ChevronRight className="h-4 w-4" />
                                }
                              </td>
                              <td colSpan={3} className="px-3 py-3 font-semibold text-gray-800">
                                {g.category}
                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 font-normal text-gray-500">
                                  {g.products.length} producto{g.products.length !== 1 ? 's' : ''}
                                </Badge>
                              </td>
                              <td className="px-3 py-3 text-right text-gray-700 font-medium">
                                {fmtN(g.stock_actual)}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-700 font-medium">
                                {fmtN(g.qty_sold)}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-400 text-xs tabular-nums">
                                {fmt(g.gross_revenue)}
                              </td>
                              <td className="px-3 py-3 text-right text-red-400 text-xs tabular-nums">
                                {g.discount > 0 ? `−${fmt(g.discount)}` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-800 font-semibold tabular-nums">
                                {fmt(g.revenue)}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-500">
                                {fmt(g.cost)}
                              </td>
                              <td className={`px-3 py-3 text-right ${marginColor(g.marginPct)}`}>
                                {fmt(g.margin)}
                              </td>
                              <td className={`px-3 py-3 text-right text-xs tabular-nums ${marginColor(g.marginPct)}`}>
                                {fmtPct(g.marginPct)}
                              </td>
                            </tr>

                            {/* ── Filas de productos (drill-down) ── */}
                            {open && g.products.map(p => (
                              <tr
                                key={`prod-${p.product_id}`}
                                className="bg-white hover:bg-violet-50/30 transition-colors"
                              >
                                <td className="px-3 py-2.5" />
                                <td className="px-3 py-2.5 text-gray-400 text-xs truncate max-w-[100px]">
                                  {g.category}
                                </td>
                                <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                                  {p.gender}
                                </td>
                                <td className="px-3 py-2.5 font-medium text-gray-800 truncate max-w-[200px]">
                                  {p.product_name}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-600">
                                  {fmtN(p.stock_actual)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-600">
                                  {fmtN(p.qty_sold)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-400 text-xs tabular-nums">
                                  {fmt(p.gross_revenue)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-red-400 text-xs tabular-nums">
                                  {p.discount > 0 ? `−${fmt(p.discount)}` : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-800 font-medium tabular-nums">
                                  {fmt(p.revenue)}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <CostEditor
                                    productId={p.product_id}
                                    cost={p.cost}
                                    qtySold={p.qty_sold}
                                    fmt={fmt}
                                    onUpdated={newCost => updateProductCost(p.product_id, newCost)}
                                  />
                                </td>
                                <td className={`px-3 py-2.5 text-right ${marginColor(p.marginPct)}`}>
                                  {fmt(p.margin)}
                                </td>
                                <td className={`px-3 py-2.5 text-right text-xs tabular-nums ${marginColor(p.marginPct)}`}>
                                  {fmtPct(p.marginPct)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </tbody>

                    {/* Fila de totales */}
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-gray-800">
                        <td />
                        <td colSpan={3} className="px-3 py-3 text-xs uppercase tracking-wide text-gray-500">
                          Total — {groups.length} categoría{groups.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-3 py-3 text-right" />
                        <td className="px-3 py-3 text-right">{fmtN(totals.qty)}</td>
                        <td className="px-3 py-3 text-right text-gray-400 text-xs tabular-nums font-normal">
                          {fmt(totals.gross_revenue)}
                        </td>
                        <td className="px-3 py-3 text-right text-red-400 text-xs tabular-nums font-normal">
                          {totals.discount > 0 ? `−${fmt(totals.discount)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmt(totals.revenue)}</td>
                        <td className="px-3 py-3 text-right text-gray-500 font-normal">{fmt(totals.cost)}</td>
                        <td className={`px-3 py-3 text-right ${marginColor(totals.marginPct)}`}>
                          {fmt(totals.margin)}
                        </td>
                        <td className={`px-3 py-3 text-right text-xs tabular-nums ${marginColor(totals.marginPct)}`}>
                          {fmtPct(totals.marginPct)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ TAB ONLINE ═══════════════════════════════════════════════════════ */}
        {tab === 'online' && (
          <>
            {/* KPIs Online */}
            {onlineRows !== null && onlineRows.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    label: 'Unidades vendidas',
                    value: fmtN(onlineTotals.qty),
                    Icon:  Package,
                    color: 'text-sky-600 bg-sky-50',
                  },
                  {
                    label: 'Ingresos online',
                    value: fmt(onlineTotals.revenue),
                    Icon:  Globe,
                    color: 'text-teal-600 bg-teal-50',
                  },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${c.color.split(' ')[1]} flex-shrink-0`}>
                      <c.Icon className={`h-5 w-5 ${c.color.split(' ')[0]}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 truncate">{c.label}</p>
                      <p className="text-base font-bold text-gray-900 truncate">{c.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Estado cargando */}
            {onlineLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
              </div>
            )}

            {/* Estado vacío */}
            {!onlineLoading && onlineRows !== null && onlineRows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                <Globe className="h-10 w-10" />
                <p className="text-sm">No hay pedidos online en el período seleccionado</p>
              </div>
            )}

            {/* Tabla Online */}
            {!onlineLoading && onlineGroups.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="w-8 px-3 py-3" />
                        <th className="px-3 py-3 text-left">Categoría</th>
                        <th className="px-3 py-3 text-left">Género</th>
                        <th className="px-3 py-3 text-left">Producto</th>
                        <th className="px-3 py-3 text-center">Tipo</th>
                        <th className="px-3 py-3 text-right">Unidades</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Ingresos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {onlineGroups.map(g => {
                        const open = onlineExpanded.has(g.category)
                        return (
                          <React.Fragment key={`oncat-${g.category}`}>
                            {/* ── Fila de categoría ── */}
                            <tr
                              className="bg-gray-50/70 hover:bg-gray-100/60 cursor-pointer select-none transition-colors"
                              onClick={() => toggleOnline(g.category)}
                            >
                              <td className="px-3 py-3 text-gray-400">
                                {open
                                  ? <ChevronDown  className="h-4 w-4" />
                                  : <ChevronRight className="h-4 w-4" />
                                }
                              </td>
                              <td colSpan={3} className="px-3 py-3 font-semibold text-gray-800">
                                {g.category}
                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 font-normal text-gray-500">
                                  {g.products.length} producto{g.products.length !== 1 ? 's' : ''}
                                </Badge>
                              </td>
                              <td className="px-3 py-3 text-center text-gray-400 text-xs">—</td>
                              <td className="px-3 py-3 text-right text-gray-700 font-medium">
                                {fmtN(g.qty_sold)}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-800 font-semibold tabular-nums">
                                {fmt(g.revenue)}
                              </td>
                            </tr>

                            {/* ── Filas de productos (drill-down) ── */}
                            {open && g.products.map(p => (
                              <tr
                                key={`onprod-${p.product_id}`}
                                className="bg-white hover:bg-sky-50/30 transition-colors"
                              >
                                <td className="px-3 py-2.5" />
                                <td className="px-3 py-2.5 text-gray-400 text-xs truncate max-w-[100px]">
                                  {g.category}
                                </td>
                                <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                                  {p.gender}
                                </td>
                                <td className="px-3 py-2.5 font-medium text-gray-800 truncate max-w-[200px]">
                                  {p.product_name}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {p.is_cj
                                    ? <Badge className="text-[10px] px-1.5 py-0 bg-sky-100 text-sky-700 border-sky-200 font-normal">CJ</Badge>
                                    : <Badge className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 border-violet-200 font-normal">Stock</Badge>
                                  }
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-600">
                                  {fmtN(p.qty_sold)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-800 font-medium tabular-nums">
                                  {fmt(p.revenue)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </tbody>

                    {/* Fila de totales */}
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-gray-800">
                        <td />
                        <td colSpan={3} className="px-3 py-3 text-xs uppercase tracking-wide text-gray-500">
                          Total — {onlineGroups.length} categoría{onlineGroups.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3 text-right">{fmtN(onlineTotals.qty)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmt(onlineTotals.revenue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
