"use client"

import { useState, useEffect, useCallback } from "react"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid,
} from "recharts"
import { Loader2, TrendingUp } from "lucide-react"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────────────────────────
type Mode = 'week' | 'month' | 'year'

interface BranchSeries {
  id:               number
  name:             string
  stock_units:      (number | null)[]
  sold_units:       (number | null)[]
  stock_cost:       (number | null)[]
  stock_list_price: (number | null)[]
  daily_sales:      (number | null)[]
}

interface SnapshotData {
  labels:   string[]
  branches: BranchSeries[]
}

// ── Paleta de colores por sucursal ─────────────────────────────────────────────
const BRANCH_COLORS = ['#7c3aed', '#059669', '#2563eb', '#d97706', '#db2777']
const getBranchColor = (idx: number) => BRANCH_COLORS[idx % BRANCH_COLORS.length]

// ── Formateo ───────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v)

const fmtNum = (v: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(v)

// ── Tooltip personalizado ──────────────────────────────────────────────────────
function CustomTooltip({
  active, payload, label, currency = false,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?:   string
  currency?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium tabular-nums">
            {currency ? fmtCurrency(p.value ?? 0) : fmtNum(p.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Construir datos para Recharts ─────────────────────────────────────────────
function buildChartData(
  labels: string[],
  branches: BranchSeries[],
  keys: (keyof BranchSeries)[]
) {
  return labels.map((label, i) => {
    const point: Record<string, string | number | null> = { label }
    for (const b of branches) {
      for (const key of keys) {
        const arr = b[key] as (number | null)[]
        point[`${b.id}_${key}`] = arr[i] ?? null
      }
    }
    return point
  })
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function StockTrendCharts() {
  const [mode,    setMode   ] = useState<Mode>('week')
  const [data,    setData   ] = useState<SnapshotData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/snapshots/stock?mode=${mode}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      toast.error('Error al cargar historial de stock')
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { load() }, [load])

  const modeLabel = { week: 'Semana', month: 'Mes', year: 'Año' }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando historial…
      </div>
    )
  }

  if (!data || data.labels.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6 text-center text-gray-400 text-sm">
        Sin datos de historial aún. Se registran al cerrar la caja cada día.
      </div>
    )
  }

  const { labels, branches } = data

  // ── Datos para los dos gráficos ────────────────────────────────────────────
  const unitsData  = buildChartData(labels, branches, ['stock_units', 'sold_units'])
  const valuesData = buildChartData(labels, branches, ['stock_cost', 'stock_list_price', 'daily_sales'])

  // Configuración de líneas por sucursal
  const LINE_STYLES = {
    stock_units:      { dash: undefined, label: 'Stock disponible (u.)' },
    sold_units:       { dash: '4 2',     label: 'Vendidas (u.)'         },
    stock_cost:       { dash: undefined, label: 'Costo stock'            },
    stock_list_price: { dash: '6 3',     label: 'P. Lista stock'        },
    daily_sales:      { dash: '2 2',     label: 'Ventas del período'    },
  } as Record<string, { dash: string | undefined; label: string }>

  return (
    <div className="space-y-6">
      {/* Selector de modo */}
      <div className="flex items-center gap-3 flex-wrap">
        <TrendingUp className="h-5 w-5 text-violet-600 shrink-0" />
        <h2 className="text-base font-bold text-gray-800">Evolución histórica</h2>
        <div className="flex border rounded-lg overflow-hidden text-sm ml-auto">
          {(['week','month','year'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 transition-colors ${mode === m
                ? 'bg-violet-600 text-white font-medium'
                : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {modeLabel[m]}
            </button>
          ))}
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {/* ── Gráfico 1: Unidades ── */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <p className="text-sm font-semibold text-gray-700 mb-4">
          Unidades — Stock disponible y prendas vendidas
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={unitsData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => <span className="text-xs">{value}</span>}
            />
            {branches.map((b, bi) => {
              const color = getBranchColor(bi)
              return [
                <Line
                  key={`${b.id}_stock`}
                  type="monotone"
                  dataKey={`${b.id}_stock_units`}
                  name={branches.length > 1 ? `${b.name} — Stock` : 'Stock disponible'}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />,
                <Line
                  key={`${b.id}_sold`}
                  type="monotone"
                  dataKey={`${b.id}_sold_units`}
                  name={branches.length > 1 ? `${b.name} — Vendidas` : 'Vendidas'}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  connectNulls
                />,
              ]
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Gráfico 2: Valores ── */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <p className="text-sm font-semibold text-gray-700 mb-4">
          Valores — Costo de stock, precio de lista y ventas del período
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={valuesData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64}
              tickFormatter={v => `$${new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`}
            />
            <Tooltip content={<CustomTooltip currency />} />
            <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
            {branches.map((b, bi) => {
              const color = getBranchColor(bi)
              return [
                <Line
                  key={`${b.id}_cost`}
                  type="monotone"
                  dataKey={`${b.id}_stock_cost`}
                  name={branches.length > 1 ? `${b.name} — Costo stock` : 'Costo stock'}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />,
                <Line
                  key={`${b.id}_list`}
                  type="monotone"
                  dataKey={`${b.id}_stock_list_price`}
                  name={branches.length > 1 ? `${b.name} — P. Lista` : 'P. Lista stock'}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                />,
                <Line
                  key={`${b.id}_sales`}
                  type="monotone"
                  dataKey={`${b.id}_daily_sales`}
                  name={branches.length > 1 ? `${b.name} — Ventas` : 'Ventas'}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="2 2"
                  dot={false}
                  connectNulls
                />,
              ]
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
