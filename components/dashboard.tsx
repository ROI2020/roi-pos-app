"use client"

import { useState, useEffect, useMemo } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts"
import {
  LayoutDashboard, Package, Warehouse, AlertTriangle,
  TrendingUp, ShoppingCart, Loader2, RefreshCw, Tag,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge }  from "@/components/ui/badge"

// ── Types ──────────────────────────────────────────────────────────────────────
interface ClassificationRow {
  name: string
  // stock actual (en branch_inventory)
  count:     number
  cost:      number
  sale:      number
  // vendido (en sale_details)
  sold_count: number
  revenue:    number
}

interface DashboardData {
  summary: {
    total:            number
    in_stock:         number
    unassigned:       number
    sold_count:       number
    stock_cost:       number
    stock_potential:  number   // base_price de prendas en stock
    revenue:          number   // ingresos reales (sale_details.unit_price)
    unclassified_products: number
  }
  by_category:  ClassificationRow[]
  by_age_group: ClassificationRow[]
  by_season:    ClassificationRow[]
  by_gender:    ClassificationRow[]
  by_branch:    ClassificationRow[]
}

// ── Formateo ───────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

const fmtShort = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n)

// ── Colores ────────────────────────────────────────────────────────────────────
const COST_COLOR    = '#f97316'
const SALE_COLOR    = '#10b981'
const REVENUE_COLOR = '#6366f1'
const COUNT_COLORS  = [
  '#7c3aed','#8b5cf6','#a78bfa','#c4b5fd',
  '#6d28d9','#5b21b6','#4c1d95','#ddd6fe',
]

// ── Tooltips ───────────────────────────────────────────────────────────────────
function ValueTooltip({
  active, payload, label,
}: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm space-y-1">
      <p className="font-semibold text-gray-800 mb-1.5">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.fill }} />
            <span className="text-gray-500">{p.name}</span>
          </span>
          <span className="font-medium tabular-nums">{fmtCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function CountTooltip({
  active, payload, label,
}: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm space-y-1">
      <p className="font-semibold text-gray-800 mb-1.5">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="flex items-center justify-between gap-4">
          <span className="text-gray-500">{p.name}</span>
          <span className="font-medium tabular-nums">{fmtNum(p.value)} prendas</span>
        </p>
      ))}
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  accent: string    // clase Tailwind de color bg del icono
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex items-start gap-3">
      <div className={`p-2.5 rounded-lg shrink-0 ${accent}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Classification Chart Card ──────────────────────────────────────────────────
type ChartView = 'stock_values' | 'stock_count' | 'sales'

function ClassificationCard({ title, data }: { title: string; data: ClassificationRow[] }) {
  const [view, setView] = useState<ChartView>('stock_values')

  const chartData = useMemo(() => data.map(d => ({
    ...d,
    label: view === 'sales'
      ? `${d.name} (${d.sold_count})`
      : `${d.name} (${d.count})`,
  })), [data, view])

  const totals = useMemo(() => data.reduce(
    (a, d) => ({
      count:      a.count      + d.count,
      cost:       a.cost       + d.cost,
      sale:       a.sale       + d.sale,
      sold_count: a.sold_count + d.sold_count,
      revenue:    a.revenue    + d.revenue,
    }),
    { count: 0, cost: 0, sale: 0, sold_count: 0, revenue: 0 }
  ), [data])

  const chartHeight = Math.max(data.length * 52 + 48, 120)

  const TABS: { key: ChartView; label: string }[] = [
    { key: 'stock_values', label: '$ Stock'   },
    { key: 'stock_count',  label: '# Stock'   },
    { key: 'sales',        label: '$ Vendido' },
  ]

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                view === t.key
                  ? 'bg-white text-gray-800 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setView(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin datos</p>
      ) : (
        <>
          {/* Chart */}
          <ResponsiveContainer width="100%" height={chartHeight}>
            {view === 'stock_values' ? (
              <BarChart data={chartData} layout="vertical"
                margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
                barCategoryGap="30%" barGap={3}
              >
                <XAxis type="number" tickFormatter={fmtShort}
                  tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={145}
                  tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <RechartTooltip content={<ValueTooltip />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="cost" name="Costo"         fill={COST_COLOR}    radius={[0,3,3,0]} maxBarSize={14} />
                <Bar dataKey="sale" name="Precio lista"  fill={SALE_COLOR}    radius={[0,3,3,0]} maxBarSize={14} />
              </BarChart>
            ) : view === 'sales' ? (
              <BarChart data={chartData} layout="vertical"
                margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
                barCategoryGap="30%"
              >
                <XAxis type="number" tickFormatter={fmtShort}
                  tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={145}
                  tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <RechartTooltip content={<ValueTooltip />} />
                <Bar dataKey="revenue" name="Ingreso real" fill={REVENUE_COLOR} radius={[0,3,3,0]} maxBarSize={18} />
              </BarChart>
            ) : (
              /* stock_count */
              <BarChart data={chartData} layout="vertical"
                margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
                barCategoryGap="30%"
              >
                <XAxis type="number"
                  tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={145}
                  tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <RechartTooltip content={<CountTooltip />} />
                <Bar dataKey="count" name="En stock" radius={[0,3,3,0]} maxBarSize={18}>
                  {chartData.map((_, i) => <Cell key={i} fill={COUNT_COLORS[i % COUNT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>

          {/* Footer: totales de stock + ventas */}
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            {/* Stock */}
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span className="font-semibold">Stock actual</span>
              <div className="flex items-center gap-4">
                <span className="text-gray-500">{fmtNum(totals.count)} prendas</span>
                <span style={{ color: COST_COLOR }}>{fmtCurrency(totals.cost)}</span>
                <span style={{ color: SALE_COLOR }}>{fmtCurrency(totals.sale)}</span>
              </div>
            </div>
            {/* Vendido */}
            {totals.sold_count > 0 && (
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-indigo-400" />
                  Vendido
                </span>
                <div className="flex items-center gap-4">
                  <span>{fmtNum(totals.sold_count)} prendas</span>
                  <span style={{ color: REVENUE_COLOR }} className="font-medium">{fmtCurrency(totals.revenue)}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Branch Table ───────────────────────────────────────────────────────────────
function BranchTable({ data }: { data: ClassificationRow[] }) {
  if (data.length === 0) return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-3">Stock por Sucursal</h3>
      <p className="text-sm text-gray-400 text-center py-6">Sin sucursales con stock</p>
    </div>
  )

  const stockRows = data.filter(d => d.name !== 'Sin asignar')
  const unassignedRow = data.find(d => d.name === 'Sin asignar')
  const totalStock = stockRows.reduce((a, d) => ({
    count: a.count + d.count, cost: a.cost + d.cost, sale: a.sale + d.sale,
  }), { count: 0, cost: 0, sale: 0 })
  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Warehouse className="h-4 w-4 text-violet-600" />
        <h3 className="font-semibold text-gray-800">Stock por Sucursal</h3>
        <Badge variant="outline" className="text-xs ml-auto">
          Solo prendas en stock
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 pr-4">Sucursal</th>
              <th className="text-right pb-2 px-4">Cant.</th>
              <th className="text-right pb-2 px-4" style={{ color: COST_COLOR }}>Costo</th>
              <th className="text-right pb-2 px-4" style={{ color: SALE_COLOR }}>Precio lista</th>
              <th className="text-right pb-2 pl-4 text-violet-500">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stockRows.map(row => {
              const margin = row.cost > 0 ? ((row.sale - row.cost) / row.cost) * 100 : 0
              return (
                <tr key={row.name}>
                  <td className="py-2.5 pr-4">
                    <div className="space-y-1">
                      <span className="font-medium text-gray-800">{row.name}</span>
                      <div className="bg-gray-100 rounded-full h-1 w-28">
                        <div className="h-full bg-violet-400 rounded-full"
                          style={{ width: `${(row.count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right font-medium tabular-nums text-gray-700">
                    {fmtNum(row.count)}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums" style={{ color: COST_COLOR }}>
                    {fmtCurrency(row.cost)}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums" style={{ color: SALE_COLOR }}>
                    {fmtCurrency(row.sale)}
                  </td>
                  <td className="py-2.5 pl-4 text-right">
                    {row.cost > 0
                      ? <span className={`font-medium ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
                        </span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
          {/* Total en stock */}
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold text-gray-700">
              <td className="pt-2.5 pr-4">Total en stock</td>
              <td className="pt-2.5 px-4 text-right tabular-nums">{fmtNum(totalStock.count)}</td>
              <td className="pt-2.5 px-4 text-right tabular-nums" style={{ color: COST_COLOR }}>
                {fmtCurrency(totalStock.cost)}
              </td>
              <td className="pt-2.5 px-4 text-right tabular-nums" style={{ color: SALE_COLOR }}>
                {fmtCurrency(totalStock.sale)}
              </td>
              <td className="pt-2.5 pl-4 text-right">
                {totalStock.cost > 0
                  ? <span className="text-emerald-600 font-medium">
                      +{(((totalStock.sale - totalStock.cost) / totalStock.cost) * 100).toFixed(0)}%
                    </span>
                  : '—'
                }
              </td>
            </tr>
            {/* Fila Sin asignar (separada, atenuada) */}
            {unassignedRow && unassignedRow.count > 0 && (
              <tr className="text-gray-400 text-xs">
                <td className="pt-2 pr-4 italic">Sin asignar a sucursal</td>
                <td className="pt-2 px-4 text-right tabular-nums">{fmtNum(unassignedRow.count)}</td>
                <td className="pt-2 px-4 text-right tabular-nums">{fmtCurrency(unassignedRow.cost)}</td>
                <td className="pt-2 px-4 text-right tabular-nums">{fmtCurrency(unassignedRow.sale)}</td>
                <td className="pt-2 pl-4" />
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,    setData   ] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError  ] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error al cargar')
      setData(await res.json())
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        Cargando dashboard…
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white border border-red-200 rounded-xl p-6 text-center space-y-3 max-w-md">
        <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
        <p className="text-gray-700 font-medium">{error ?? 'Error desconocido'}</p>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </Button>
      </div>
    </div>
  )

  const { summary: s } = data

  // Porcentajes para subtítulos
  const pctStock      = s.total > 0 ? Math.round((s.in_stock    / s.total) * 100) : 0
  const pctUnassigned = s.total > 0 ? Math.round((s.unassigned  / s.total) * 100) : 0
  const pctSold       = s.total > 0 ? Math.round((s.sold_count  / s.total) * 100) : 0

  // Margen sobre el stock actual
  const stockMargin = s.stock_cost > 0
    ? ((s.stock_potential - s.stock_cost) / s.stock_cost) * 100
    : 0

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Título */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard de Stock</h1>
              <p className="text-sm text-gray-500">
                {fmtNum(s.total)} prenda{s.total !== 1 ? 's' : ''} registradas
                · {fmtNum(s.in_stock)} en stock · {fmtNum(s.sold_count)} vendidas
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>

        {/* Alerta: productos sin clasificar */}
        {s.unclassified_products > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-center">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{fmtNum(s.unclassified_products)} producto{s.unclassified_products !== 1 ? 's' : ''}</span>
              {' '}sin clasificar completamente. Los gráficos pueden estar incompletos.
            </p>
          </div>
        )}

        {/* ── KPI Cards — 2 filas de 3 ── */}
        {/* Fila 1: estado del inventario */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="En stock"
            value={fmtNum(s.in_stock)}
            sub={`${pctStock}% del total recibido`}
            icon={Warehouse}
            accent="bg-violet-500"
          />
          <KpiCard
            label="Sin asignar"
            value={fmtNum(s.unassigned)}
            sub={`${pctUnassigned}% — recibidas, sin sucursal`}
            icon={Package}
            accent={s.unassigned > 0 ? 'bg-amber-500' : 'bg-gray-400'}
          />
          <KpiCard
            label="Vendidas"
            value={fmtNum(s.sold_count)}
            sub={`${pctSold}% del total recibido`}
            icon={ShoppingCart}
            accent="bg-emerald-500"
          />
        </div>

        {/* Fila 2: valores financieros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Costo del stock"
            value={fmtCurrency(s.stock_cost)}
            sub="Precio de compra · prendas en stock"
            icon={Tag}
            accent="bg-orange-500"
          />
          <KpiCard
            label="Precio lista del stock"
            value={fmtCurrency(s.stock_potential)}
            sub={`Margen ${stockMargin >= 0 ? '+' : ''}${stockMargin.toFixed(0)}% sobre costo`}
            icon={TrendingUp}
            accent="bg-green-600"
          />
          <KpiCard
            label="Ingresos realizados"
            value={fmtCurrency(s.revenue)}
            sub={`${fmtNum(s.sold_count)} prenda${s.sold_count !== 1 ? 's' : ''} vendida${s.sold_count !== 1 ? 's' : ''}`}
            icon={TrendingUp}
            accent="bg-indigo-500"
          />
        </div>

        {/* ── Clasificaciones — 2 columnas ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ClassificationCard title="Por Categoría"  data={data.by_category}  />
          <ClassificationCard title="Por Temporada"  data={data.by_season}    />
          <ClassificationCard title="Por Edad"       data={data.by_age_group} />
          <ClassificationCard title="Por Género"     data={data.by_gender}    />
        </div>

        {/* ── Por Sucursal — ancho completo ── */}
        <BranchTable data={data.by_branch} />

      </div>
    </div>
  )
}
