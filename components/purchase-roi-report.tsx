"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSm,
  Loader2, Pencil, Check, X, TrendingUp, Package, ShoppingBag,
  AlertTriangle, Search,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Badge }  from "@/components/ui/badge"

// ── Types ──────────────────────────────────────────────────────────────────────
interface PurchaseSummary {
  id:               number
  purchase_date:    string
  title:            string | null
  invoice_number:   string | null
  supplier_name:    string | null
  total_units:      number
  total_cost:       number
  sold_units:       number
  revenue:          number
  cost_of_sold:     number
  last_sale_at:     string | null
  days_since_purchase: number
}

interface VariantDetail {
  id:         number
  sku:        string
  color:      string
  size:       string
  unit_cost:  number
  status:     'vendido' | 'en_stock' | 'sin_asignar'
  sale_price: number | null
  sold_at:    string | null
}

interface ProductGroup {
  product_id:          number
  product_name:        string
  base_price:          number
  total_units:         number
  total_cost:          number
  sold_units:          number
  revenue:             number
  cost_of_sold:        number
  last_sale_at:        string | null
  days_since_purchase: number
  detail_count:        number
  purchase_detail_id:  number
  unit_cost_per_item:  number
  variants:            VariantDetail[]
}

type DateMode = 'week' | 'month' | 'custom'

// ── Date helpers ───────────────────────────────────────────────────────────────
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const fmtShort = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`

const fmtDateStr = (iso: string) => fmtShort(new Date(iso))

const fmtHour = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function getWeekRange(off: number): [Date, Date] {
  const t = new Date(); t.setHours(0,0,0,0)
  const dow = t.getDay()
  const mon = new Date(t); mon.setDate(t.getDate() + (dow===0?-6:1-dow) + off*7)
  const sun = new Date(mon); sun.setDate(mon.getDate()+6)
  return [mon, off===0 ? new Date() : sun]
}
function getMonthRange(off: number): [Date, Date] {
  const n = new Date()
  const first = new Date(n.getFullYear(), n.getMonth()+off, 1)
  const last  = off===0 ? new Date() : new Date(n.getFullYear(), n.getMonth()+off+1, 0)
  return [first, last]
}

// ── Formateo ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style:'currency', currency:'ARS', maximumFractionDigits:0,
  }).format(n)

const fmtPct = (n: number | null) => n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

// ── Cálculos ──────────────────────────────────────────────────────────────────
const margin   = (rev: number, cost: number) => cost > 0 ? (rev - cost) / cost * 100 : null
const pctSold  = (sold: number, total: number) => total > 0 ? sold / total * 100 : 0

// ── Colores ───────────────────────────────────────────────────────────────────
const marginBg = (pct: number | null) => {
  if (pct === null) return 'bg-gray-100 text-gray-500'
  if (pct >= 40)    return 'bg-green-100  text-green-800  font-semibold'
  if (pct >= 20)    return 'bg-yellow-100 text-yellow-800 font-semibold'
  if (pct >= 5)     return 'bg-orange-100 text-orange-800 font-semibold'
  return                   'bg-red-100    text-red-800    font-semibold'
}

const daysBg = (days: number) => {
  if (days <= 30) return 'bg-green-100  text-green-800'
  if (days <= 60) return 'bg-yellow-100 text-yellow-800'
  if (days <= 90) return 'bg-orange-100 text-orange-800'
  return                 'bg-red-100    text-red-800'
}

const statusColor = {
  vendido:     'text-green-700',
  en_stock:    'text-emerald-700',
  sin_asignar: 'text-gray-400',
}

// ── Barra de % vendido ─────────────────────────────────────────────────────────
function SoldBar({ sold, total }: { sold: number; total: number }) {
  const pct = pctSold(sold, total)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : pct > 0 ? 'bg-orange-400' : 'bg-gray-200'
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-600 whitespace-nowrap">{sold}/{total}</span>
    </div>
  )
}

// ── Badge de días ─────────────────────────────────────────────────────────────
function DaysBadge({ days }: { days: number }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${daysBg(days)}`}>
      {days}d
    </span>
  )
}

// ── Badge de margen ───────────────────────────────────────────────────────────
function MarginBadge({ rev, cost }: { rev: number; cost: number }) {
  const pct = margin(rev, cost)
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${marginBg(pct)}`}>
      {fmtPct(pct)}
    </span>
  )
}

// ── Edición inline del título ─────────────────────────────────────────────────
function TitleCell({
  purchaseId, title, onUpdated,
}: { purchaseId: number; title: string | null; onUpdated: (t: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue  ] = useState(title ?? '')
  const [saving,  setSaving ] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: value.trim() || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdated(value.trim() || null)
      setEditing(false)
    } catch (err: unknown) { toast.error((err as Error).message) }
    finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1 group">
        <span className={title ? 'font-medium text-gray-900' : 'italic text-gray-400 text-xs'}>
          {title ?? 'Sin título'}
        </span>
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-violet-600"
          onClick={() => { setValue(title ?? ''); setEditing(true) }}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <Input
        autoFocus
        className="h-7 text-sm w-56"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key==='Enter') save(); if (e.key==='Escape') setEditing(false) }}
        placeholder="Título de la compra…"
      />
      <button onClick={save} disabled={saving}
        className="text-green-600 hover:text-green-700 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Edición inline del costo unitario ─────────────────────────────────────────
function CostCell({
  detailId, unitCost, totalUnits, onUpdated,
}: {
  detailId:  number
  unitCost:  number
  totalUnits: number
  onUpdated: (newUnitCost: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue  ] = useState(String(unitCost))
  const [saving,  setSaving ] = useState(false)

  const save = async () => {
    const parsed = parseFloat(value.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) { toast.error('Costo inválido'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/purchase-details/${detailId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ unit_cost: parsed }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdated(parsed)
      setEditing(false)
    } catch (err: unknown) { toast.error((err as Error).message) }
    finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <div
        className="flex items-center justify-end gap-1 group cursor-pointer"
        onClick={e => { e.stopPropagation(); setValue(String(unitCost)); setEditing(true) }}
        title="Clic para editar costo"
      >
        <span className="tabular-nums text-xs text-gray-700">{fmt(unitCost * totalUnits)}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-violet-400 shrink-0" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1 py-0.5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">$ / u</span>
        <Input
          autoFocus
          type="number" min={0} step={100}
          className="h-6 text-xs w-28 text-right"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        />
        <button
          onClick={save} disabled={saving}
          className="text-green-600 hover:text-green-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="text-[10px] text-gray-400">
        {fmt(parseFloat(value.replace(',','.')) || 0)} × {totalUnits} u
        = {fmt((parseFloat(value.replace(',','.')) || 0) * totalUnits)}
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════
export default function PurchaseRoiReport() {
  // ── Rango ─────────────────────────────────────────────────────────────────
  const [mode,        setMode      ] = useState<DateMode>('month')
  const [weekOffset,  setWeekOff   ] = useState(0)
  const [monthOffset, setMonthOff  ] = useState(0)
  const [customFrom,  setCustomFrom] = useState(toYMD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [customTo,    setCustomTo  ] = useState(toYMD(new Date()))

  const [fromDate, toDate] = useMemo<[Date, Date]>(() => {
    if (mode==='week')  return getWeekRange(weekOffset)
    if (mode==='month') return getMonthRange(monthOffset)
    return [new Date(customFrom+'T00:00:00'), new Date(customTo+'T23:59:59')]
  }, [mode, weekOffset, monthOffset, customFrom, customTo])

  const fromYMD = toYMD(fromDate)
  const toYMD2  = toYMD(toDate)

  // ── Filtros de búsqueda con debounce ──────────────────────────────────────
  const [supplierSearch,  setSupplierSearch ] = useState('')
  const [productSearch,   setProductSearch  ] = useState('')
  const [debouncedSup,    setDebouncedSup   ] = useState('')
  const [debouncedProd,   setDebouncedProd  ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSup(supplierSearch), 400)
    return () => clearTimeout(t)
  }, [supplierSearch])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedProd(productSearch), 400)
    return () => clearTimeout(t)
  }, [productSearch])

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [purchases,    setPurchases   ] = useState<PurchaseSummary[]>([])
  const [loading,      setLoading     ] = useState(false)
  const [details,      setDetails     ] = useState<Record<number, ProductGroup[]>>({})
  const [loadingDet,   setLoadingDet  ] = useState<Set<number>>(new Set())
  const [expandedPur,  setExpandedPur ] = useState<Set<number>>(new Set())
  const [expandedProd, setExpandedProd] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setExpandedPur(new Set()); setExpandedProd(new Set()); setDetails({})
    try {
      const qs = new URLSearchParams({ from: fromYMD, to: toYMD2 })
      if (debouncedSup)  qs.set('supplier', debouncedSup)
      if (debouncedProd) qs.set('product',  debouncedProd)
      const data: PurchaseSummary[] = await fetch(
        `/api/reports/purchase-roi?${qs}`
      ).then(r => r.json())
      setPurchases(data)
    } catch { toast.error('Error al cargar el reporte') }
    finally  { setLoading(false) }
  }, [fromYMD, toYMD2, debouncedSup, debouncedProd])

  useEffect(() => { load() }, [load])

  const togglePurchase = async (id: number) => {
    if (expandedPur.has(id)) {
      setExpandedPur(s => { const n=new Set(s); n.delete(id); return n })
      return
    }
    setExpandedPur(s => new Set([...s, id]))
    if (details[id]) return
    setLoadingDet(s => new Set([...s, id]))
    try {
      const data: ProductGroup[] = await fetch(`/api/reports/purchase-roi/${id}`).then(r=>r.json())
      setDetails(d => ({ ...d, [id]: data }))
    } catch { toast.error('Error al cargar el detalle') }
    finally  { setLoadingDet(s => { const n=new Set(s); n.delete(id); return n }) }
  }

  const toggleProduct = (key: string) =>
    setExpandedProd(s => { const n=new Set(s); n.has(key)?n.delete(key):n.add(key); return n })

  const updateTitle = (id: number, title: string | null) =>
    setPurchases(prev => prev.map(p => p.id===id ? {...p, title} : p))

  // ── KPIs globales ─────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total_cost    = purchases.reduce((s,p) => s + p.total_cost, 0)
    const revenue       = purchases.reduce((s,p) => s + p.revenue,   0)
    const cost_of_sold  = purchases.reduce((s,p) => s + p.cost_of_sold, 0)
    const total_units   = purchases.reduce((s,p) => s + p.total_units, 0)
    const sold_units    = purchases.reduce((s,p) => s + p.sold_units,  0)
    const gross_margin  = margin(revenue, cost_of_sold)
    return { total_cost, revenue, cost_of_sold, total_units, sold_units, gross_margin,
             balance: revenue - cost_of_sold }
  }, [purchases])

  // ── Label del rango ───────────────────────────────────────────────────────
  const rangeLabel = (() => {
    if (mode==='week') {
      const [m,s]=getWeekRange(weekOffset)
      return weekOffset===0 ? `Esta semana · ${fmtShort(m)} — ${fmtShort(s)}`
                            : `Semana del ${fmtShort(m)} al ${fmtShort(s)}`
    }
    if (mode==='month') {
      const [f]=getMonthRange(monthOffset)
      return monthOffset===0
        ? `${MONTH_NAMES[f.getMonth()]} ${f.getFullYear()} · ${fmtShort(f)} — hoy`
        : `${MONTH_NAMES[f.getMonth()]} ${f.getFullYear()}`
    }
    return `${fmtShort(new Date(customFrom+'T00:00:00'))} — ${fmtShort(new Date(customTo+'T00:00:00'))}`
  })()

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Cabecera ── */}
      <div className="bg-white border-b shadow-sm sticky top-14 z-30">
        <div className="max-w-screen-xl mx-auto px-4 py-3 space-y-3">

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-violet-600 shrink-0" />
              <h1 className="text-xl font-bold text-gray-900">Rendimiento de Compras</h1>
              {!loading && (
                <span className="text-sm text-gray-400">
                  {purchases.length} compra{purchases.length!==1?'s':''}
                </span>
              )}
            </div>
          </div>

          {/* Selector de rango */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex border rounded-lg overflow-hidden text-sm">
              {([['week','Semana'],['month','Mes'],['custom','Rango']] as [DateMode,string][]).map(([m,l])=>(
                <button key={m} onClick={()=>setMode(m)}
                  className={`px-3 py-1.5 transition-colors ${mode===m
                    ?'bg-violet-600 text-white font-medium':'text-gray-500 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>

            {mode==='week' && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>setWeekOff(w=>w-1)}>
                  <ChevronLeft className="h-4 w-4"/>
                </Button>
                <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">{rangeLabel}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={()=>setWeekOff(w=>w+1)} disabled={weekOffset>=0}>
                  <ChevronRight className="h-4 w-4"/>
                </Button>
              </div>
            )}
            {mode==='month' && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>setMonthOff(m=>m-1)}>
                  <ChevronLeft className="h-4 w-4"/>
                </Button>
                <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">{rangeLabel}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={()=>setMonthOff(m=>m+1)} disabled={monthOffset>=0}>
                  <ChevronRight className="h-4 w-4"/>
                </Button>
              </div>
            )}
            {mode==='custom' && (
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Desde</span>
                  <Input type="date" className="h-8 w-36 text-sm"
                    value={customFrom} onChange={e=>setCustomFrom(e.target.value)} max={customTo}/>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Hasta</span>
                  <Input type="date" className="h-8 w-36 text-sm"
                    value={customTo} onChange={e=>setCustomTo(e.target.value)}
                    min={customFrom} max={toYMD(new Date())}/>
                </div>
              </div>
            )}
          </div>

          {/* Filtros de búsqueda */}
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none"/>
              <Input
                className="h-8 w-48 pl-8 text-sm"
                placeholder="Proveedor…"
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none"/>
              <Input
                className="h-8 w-48 pl-8 text-sm"
                placeholder="Producto…"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
            </div>
            {(supplierSearch || productSearch) && (
              <button
                className="text-xs text-gray-400 hover:text-gray-600 underline"
                onClick={() => { setSupplierSearch(''); setProductSearch('') }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-6">

        {/* ── KPI Cards ── */}
        {purchases.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Invertido',   value: fmt(kpi.total_cost),   sub: `${purchases.length} compras`,           color: 'border-l-gray-400'   },
              { label: 'Recuperado',  value: fmt(kpi.revenue),      sub: `${kpi.sold_units} prendas vendidas`,    color: 'border-l-green-500'  },
              { label: 'Balance',     value: fmt(kpi.balance),      sub: 'ingresos − costo vendido',              color: kpi.balance>=0?'border-l-green-500':'border-l-red-500' },
              { label: 'Margen',      value: fmtPct(kpi.gross_margin), sub: 'sobre lo vendido',                  color: 'border-l-violet-500' },
              { label: 'Vendido',     value: `${kpi.sold_units}/${kpi.total_units}`, sub: `${pctSold(kpi.sold_units,kpi.total_units).toFixed(0)}% del total`, color: 'border-l-emerald-500' },
              { label: 'Sin vender',  value: `${kpi.total_units - kpi.sold_units}`, sub: 'prendas en stock o sin asignar', color: 'border-l-amber-400' },
            ].map(({label,value,sub,color})=>(
              <div key={label} className={`bg-white rounded-xl border shadow-sm p-3 border-l-4 ${color}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabla ── */}
        {loading && purchases.length===0 ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin"/> Cargando…
          </div>
        ) : purchases.length===0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <ShoppingBag className="h-12 w-12 text-gray-300"/>
            <p className="font-medium text-gray-500">Sin compras en este período</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="w-8 px-2 py-2.5"/>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Título / Proveedor</th>
                  <th className="text-right px-3 py-2.5">Unidades</th>
                  <th className="text-right px-3 py-2.5">$ Costo</th>
                  <th className="text-left px-3 py-2.5">% Vendido</th>
                  <th className="text-right px-3 py-2.5">$ Venta</th>
                  <th className="text-right px-3 py-2.5">Margen</th>
                  <th className="text-center px-3 py-2.5">Días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {purchases.map(pu => {
                  const isExp   = expandedPur.has(pu.id)
                  const isLoading = loadingDet.has(pu.id)
                  const pctM = margin(pu.revenue, pu.cost_of_sold)

                  return [
                    // ── Fila de compra ──────────────────────────────────────
                    <tr
                      key={`pu-${pu.id}`}
                      className={`cursor-pointer transition-colors ${isExp ? 'bg-violet-50' : 'hover:bg-gray-50'}`}
                      onClick={() => togglePurchase(pu.id)}
                    >
                      <td className="px-2 py-3 text-center">
                        {isLoading
                          ? <Loader2 className="h-4 w-4 animate-spin text-gray-400 mx-auto"/>
                          : isExp
                          ? <ChevronDown     className="h-4 w-4 text-violet-500 mx-auto"/>
                          : <ChevronRightSm  className="h-4 w-4 text-gray-300 mx-auto"/>
                        }
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDateStr(pu.purchase_date)}
                        {pu.invoice_number && (
                          <p className="text-[10px] text-gray-400">#{pu.invoice_number}</p>
                        )}
                      </td>
                      <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                        <TitleCell purchaseId={pu.id} title={pu.title} onUpdated={t=>updateTitle(pu.id,t)}/>
                        {pu.supplier_name && (
                          <p className="text-xs text-gray-400 mt-0.5">{pu.supplier_name}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                        {pu.total_units}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900">
                        {fmt(pu.total_cost)}
                      </td>
                      <td className="px-3 py-3">
                        <SoldBar sold={pu.sold_units} total={pu.total_units}/>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-green-700 font-medium">
                        {pu.revenue > 0 ? fmt(pu.revenue) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {pu.cost_of_sold > 0
                          ? <MarginBadge rev={pu.revenue} cost={pu.cost_of_sold}/>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-center">
                        <DaysBadge days={pu.days_since_purchase}/>
                      </td>
                    </tr>,

                    // ── Filas de detalle (productos) ────────────────────────
                    ...(isExp && details[pu.id] ? details[pu.id].map(pg => {
                      const prodKey   = `${pu.id}-${pg.product_id}`
                      const isProdExp = expandedProd.has(prodKey)
                      const costZero  = pg.unit_cost_per_item === 0
                      const lowMargin = !costZero && pg.base_price > 0
                        && pg.unit_cost_per_item >= pg.base_price * 0.90
                      const hasAlert  = costZero || lowMargin

                      return [
                        // Fila de producto
                        <tr
                          key={`prod-${prodKey}`}
                          className={`cursor-pointer hover:bg-violet-100/40 ${hasAlert ? 'bg-red-50/60' : 'bg-violet-50/60'}`}
                          onClick={() => toggleProduct(prodKey)}
                        >
                          <td/>
                          <td className="pl-8 py-2">
                            {isProdExp
                              ? <ChevronDown    className="h-3.5 w-3.5 text-violet-400"/>
                              : <ChevronRightSm className="h-3.5 w-3.5 text-gray-300"/>
                            }
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Package className="h-3.5 w-3.5 text-violet-400 shrink-0"/>
                              <span className="font-medium text-gray-800 text-sm">{pg.product_name}</span>
                              {costZero && (
                                <span className="inline-flex items-center gap-0.5 text-[11px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                                  <AlertTriangle className="h-3 w-3"/> Costo $0
                                </span>
                              )}
                              {lowMargin && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[11px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold"
                                  title={`Costo $${pg.unit_cost_per_item.toLocaleString('es-AR')} vs precio $${pg.base_price.toLocaleString('es-AR')}`}
                                >
                                  <AlertTriangle className="h-3 w-3"/> Margen &lt;10%
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                            {pg.total_units}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {pg.detail_count === 1
                              ? <CostCell
                                  detailId={pg.purchase_detail_id}
                                  unitCost={pg.unit_cost_per_item}
                                  totalUnits={pg.total_units}
                                  onUpdated={newUnitCost => {
                                    setDetails(prev => ({
                                      ...prev,
                                      [pu.id]: prev[pu.id].map(g =>
                                        g.product_id === pg.product_id
                                          ? { ...g, unit_cost_per_item: newUnitCost, total_cost: newUnitCost * g.total_units }
                                          : g
                                      ),
                                    }))
                                  }}
                                />
                              : <span className="tabular-nums text-xs text-gray-700">{fmt(pg.total_cost)}</span>
                            }
                          </td>
                          <td className="px-3 py-2">
                            <SoldBar sold={pg.sold_units} total={pg.total_units}/>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-green-700">
                            {pg.revenue > 0 ? fmt(pg.revenue) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {pg.cost_of_sold > 0
                              ? <MarginBadge rev={pg.revenue} cost={pg.cost_of_sold}/>
                              : <span className="text-xs text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-3 py-2 text-center">
                            <DaysBadge days={pg.days_since_purchase}/>
                          </td>
                        </tr>,

                        // Filas de variantes (si producto expandido)
                        ...(isProdExp ? pg.variants.map(v => {
                          const vm = v.sale_price && v.unit_cost
                            ? margin(v.sale_price, v.unit_cost) : null
                          return (
                            <tr key={`var-${v.id}`} className="bg-gray-50/80 text-xs">
                              <td colSpan={2}/>
                              <td className="pl-14 pr-3 py-1.5">
                                <span className="font-mono text-[10px] text-gray-400">{v.sku}</span>
                                <span className="mx-1 text-gray-300">·</span>
                                <span className="text-gray-600">{v.color}</span>
                                <span className="mx-1 text-gray-300">·</span>
                                <span className="font-medium text-gray-700">T.{v.size}</span>
                              </td>
                              <td/>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                                {fmt(v.unit_cost)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className={`font-medium ${statusColor[v.status]}`}>
                                  {v.status === 'vendido' ? '✓ Vendido' :
                                   v.status === 'en_stock' ? '● En stock' : '○ Sin asignar'}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-green-700">
                                {v.sale_price ? fmt(v.sale_price) : '—'}
                                {v.sold_at && (
                                  <p className="text-[10px] text-gray-400">
                                    {fmtDateStr(v.sold_at)} {fmtHour(v.sold_at)}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {vm !== null
                                  ? <span className={`text-xs px-1.5 py-0.5 rounded-full ${marginBg(vm)}`}>
                                      {fmtPct(vm)}
                                    </span>
                                  : <span className="text-gray-300">—</span>
                                }
                              </td>
                              <td/>
                            </tr>
                          )
                        }) : []),
                      ]
                    }).flat() : []),
                  ]
                }).flat()}
              </tbody>

              {/* ── Totales ── */}
              {purchases.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                    <td colSpan={3} className="px-4 py-2.5 text-gray-600">
                      Total · {purchases.length} compras
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                      {kpi.total_units}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                      {fmt(kpi.total_cost)}
                    </td>
                    <td className="px-3 py-2.5">
                      <SoldBar sold={kpi.sold_units} total={kpi.total_units}/>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-700">
                      {fmt(kpi.revenue)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {kpi.cost_of_sold > 0
                        ? <MarginBadge rev={kpi.revenue} cost={kpi.cost_of_sold}/>
                        : '—'
                      }
                    </td>
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
