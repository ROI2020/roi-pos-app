"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  ChevronLeft, ChevronRight, Printer, Download,
  TrendingUp, TrendingDown, RefreshCw, Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, Filter,
  Unlock, Lock, AlertTriangle, CheckCircle2, Vault,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Badge }  from "@/components/ui/badge"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Movement {
  type:           'venta' | 'gasto' | 'cambio' | 'retiro'
  source_id:      string
  datetime:       string
  description:    string
  notes:          string | null
  branch_name:    string
  branch_id:      number
  payment_method: string
  user_name:      string
  total:          number
  efectivo:       number
  debito:         number
  credito:        number
  mp:             number
  transferencia:  number
}

interface SessionInfo {
  id:               number
  branch_id:        number
  branch_name:      string
  opened_at:        string
  opening_balance:  number
  opened_by:        string | null
  closed_at:        string | null
  closing_balance:  number | null
  closed_by:        string | null
  notes:            string | null
}

type DateMode   = 'week' | 'month' | 'custom'
type SortField  = 'datetime' | 'type' | 'branch_name' | 'efectivo' | 'debito' | 'credito' | 'mp' | 'transferencia' | 'total'
type SortDir    = 'asc' | 'desc'

// ── Date helpers ───────────────────────────────────────────────────────────────
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const fmtShort = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`

const fmtHour = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const fmtDateShort = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function getWeekRange(offset: number): [Date, Date] {
  const today = new Date(); today.setHours(0,0,0,0)
  const dow = today.getDay()
  const daysToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(today)
  mon.setDate(today.getDate() + daysToMon + offset * 7)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const to = offset === 0 ? new Date() : sun
  return [mon, to]
}

function getMonthRange(offset: number): [Date, Date] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last  = offset === 0 ? new Date() : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return [first, last]
}

// ── Formateo de moneda (sin símbolo para las celdas) ──────────────────────────
const fmtAmt = (n: number, forceSign = false) => {
  if (n === 0) return '—'
  const abs = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.abs(n))
  const sign = n < 0 ? '-' : forceSign ? '+' : ''
  return `${sign}$${abs}`
}

const fmtAmtFull = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

// ── CSV export ────────────────────────────────────────────────────────────────
function downloadCSV(movements: Movement[], from: string, to: string) {
  const headers = ['Fecha','Hora','Tipo','Descripción','Vendedor','Sucursal','Efectivo','Débito','Crédito','MP','Transferencia','Total']
  const rows = movements.map(m => [
    fmtDateShort(m.datetime),
    fmtHour(m.datetime),
    m.type,
    m.description.replace(/"/g,'""'),
    m.user_name,
    m.branch_name,
    m.efectivo, m.debito, m.credito, m.mp, m.transferencia, m.total,
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${c}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `movimientos-${from}-${to}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Type badge ────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  venta:  { label: 'Venta',  bg: 'bg-green-100 text-green-700',   Icon: TrendingUp   },
  gasto:  { label: 'Gasto',  bg: 'bg-red-100   text-red-700',     Icon: TrendingDown },
  cambio: { label: 'Cambio', bg: 'bg-violet-100 text-violet-700',  Icon: RefreshCw    },
  retiro: { label: 'Retiro', bg: 'bg-orange-100 text-orange-700',  Icon: Vault        },
}

// ── Sortable column header ─────────────────────────────────────────────────────
function SortTh({
  field, label, sort, dir, onSort, right = false,
}: {
  field: SortField; label: string; sort: SortField; dir: SortDir
  onSort: (f: SortField) => void; right?: boolean
}) {
  const active = sort === field
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer
        select-none hover:bg-gray-100 whitespace-nowrap
        ${right ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-30" />
        }
      </span>
    </th>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════
export default function CashFlowReport() {
  // ── Rango de fechas ───────────────────────────────────────────────────────
  const [mode,        setMode       ] = useState<DateMode>('week')
  const [weekOffset,  setWeekOffset ] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [customFrom,  setCustomFrom ] = useState(toYMD(new Date()))
  const [customTo,    setCustomTo   ] = useState(toYMD(new Date()))

  const [fromDate, toDate] = useMemo<[Date, Date]>(() => {
    if (mode === 'week')  return getWeekRange(weekOffset)
    if (mode === 'month') return getMonthRange(monthOffset)
    return [new Date(customFrom + 'T00:00:00'), new Date(customTo + 'T23:59:59')]
  }, [mode, weekOffset, monthOffset, customFrom, customTo])

  const fromYMD = toYMD(fromDate)
  const toYMD2  = toYMD(toDate)

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [movements, setMovements] = useState<Movement[]>([])
  const [sessions,  setSessions ] = useState<SessionInfo[]>([])
  const [loading,   setLoading  ] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [movData, sesData] = await Promise.all([
        fetch(`/api/reports/cash-flow?from=${fromYMD}&to=${toYMD2}`).then(r => r.json()),
        fetch(`/api/reports/cash-flow/sessions?from=${fromYMD}&to=${toYMD2}`).then(r => r.json()),
      ])
      setMovements(movData)
      setSessions(sesData)
    } catch { toast.error('Error al cargar movimientos') }
    finally  { setLoading(false) }
  }, [fromYMD, toYMD2])

  useEffect(() => { load() }, [load])

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [showVentas,  setShowVentas ] = useState(true)
  const [showGastos,  setShowGastos ] = useState(true)
  const [showCambios, setShowCambios] = useState(true)
  const [showRetiros, setShowRetiros] = useState(true)
  const [branchFilter, setBranchFilter] = useState('__all__')

  const branches = useMemo(() =>
    [...new Map(movements.map(m => [m.branch_id, m.branch_name])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  [movements])

  // ── Orden ─────────────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>('datetime')
  const [sortDir,   setSortDir  ] = useState<SortDir>('desc')

  const handleSort = (f: SortField) => {
    if (f === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  // ── Movimientos filtrados y ordenados ─────────────────────────────────────
  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (m.type === 'venta'  && !showVentas)  return false
      if (m.type === 'gasto'  && !showGastos)  return false
      if (m.type === 'cambio' && !showCambios) return false
      if (m.type === 'retiro' && !showRetiros) return false
      if (branchFilter !== '__all__' && String(m.branch_id) !== branchFilter) return false
      return true
    })
  }, [movements, showVentas, showGastos, showCambios, branchFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField as keyof Movement]
      const bVal = b[sortField as keyof Movement]
      const cmp  = aVal! > bVal! ? 1 : aVal! < bVal! ? -1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortField, sortDir])

  // ── Totales por sucursal (sobre los registros filtrados) ──────────────────
  type BranchTotal = {
    branch_id: number; branch_name: string
    efectivo: number; debito: number; credito: number; mp: number; transferencia: number; total: number
  }
  const branchTotals = useMemo<BranchTotal[]>(() => {
    const map = new Map<number, BranchTotal>()
    for (const m of filtered) {
      const cur = map.get(m.branch_id) ?? {
        branch_id: m.branch_id, branch_name: m.branch_name,
        efectivo: 0, debito: 0, credito: 0, mp: 0, transferencia: 0, total: 0,
      }
      cur.efectivo      += m.efectivo
      cur.debito        += m.debito
      cur.credito       += m.credito
      cur.mp            += m.mp
      cur.transferencia += m.transferencia
      cur.total         += m.total
      map.set(m.branch_id, cur)
    }
    return [...map.values()].sort((a, b) => a.branch_name.localeCompare(b.branch_name))
  }, [filtered])

  const grandTotal = useMemo<Omit<BranchTotal, 'branch_id'|'branch_name'>>(() => ({
    efectivo:      branchTotals.reduce((s,b) => s + b.efectivo,      0),
    debito:        branchTotals.reduce((s,b) => s + b.debito,        0),
    credito:       branchTotals.reduce((s,b) => s + b.credito,       0),
    mp:            branchTotals.reduce((s,b) => s + b.mp,            0),
    transferencia: branchTotals.reduce((s,b) => s + b.transferencia, 0),
    total:         branchTotals.reduce((s,b) => s + b.total,         0),
  }), [branchTotals])

  // ── Sesiones filtradas por sucursal ──────────────────────────────────────
  const filteredSessions = useMemo(() =>
    branchFilter === '__all__'
      ? sessions
      : sessions.filter(s => String(s.branch_id) === branchFilter),
  [sessions, branchFilter])

  // Sesiones agrupadas por sucursal (para las filas de apertura/cierre por tabla)
  const sessionsByBranch = useMemo(() => {
    const map = new Map<number, SessionInfo[]>()
    for (const s of filteredSessions) {
      if (!map.has(s.branch_id)) map.set(s.branch_id, [])
      map.get(s.branch_id)!.push(s) // ya vienen ORDER BY opened_at ASC
    }
    return map
  }, [filteredSessions])

  // Sucursales presentes en los movimientos filtrados — Caja Central (id=0) al final
  const allBranchesForDetail = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of filtered) map.set(m.branch_id, m.branch_name)
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.id === 0 ? 1 : b.id === 0 ? -1 : a.name.localeCompare(b.name))
  }, [filtered])

  // ── Etiqueta del rango ────────────────────────────────────────────────────
  const rangeLabel = (() => {
    if (mode === 'week') {
      const [mon, sun] = getWeekRange(weekOffset)
      return weekOffset === 0
        ? `Esta semana · ${fmtShort(mon)} — ${fmtShort(sun)}`
        : `Semana del ${fmtShort(mon)} al ${fmtShort(sun)}`
    }
    if (mode === 'month') {
      const [first] = getMonthRange(monthOffset)
      const [,  last] = getMonthRange(monthOffset)
      return monthOffset === 0
        ? `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()} · ${fmtShort(first)} — hoy`
        : `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()} · ${fmtShort(first)} — ${fmtShort(last)}`
    }
    return `${fmtShort(new Date(customFrom+'T00:00:00'))} — ${fmtShort(new Date(customTo+'T00:00:00'))}`
  })()

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Cabecera sticky ── */}
      <div className="bg-white border-b shadow-sm sticky top-14 z-30 no-print">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 space-y-3">

          {/* Título + acciones */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Movimientos de Caja</h1>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => downloadCSV(sorted, fromYMD, toYMD2)}
                disabled={sorted.length === 0}
              >
                <Download className="h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </div>

          {/* Selector de rango */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Tabs de modo */}
            <div className="flex border rounded-lg overflow-hidden text-sm">
              {([['week','Semana'],['month','Mes'],['custom','Rango']] as [DateMode,string][]).map(([m,lbl]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 transition-colors ${mode === m
                    ? 'bg-violet-600 text-white font-medium'
                    : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            {/* Navegación semana */}
            {mode === 'week' && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(w => w - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
                  {rangeLabel}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setWeekOffset(w => w + 1)}
                  disabled={weekOffset >= 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Navegación mes */}
            {mode === 'month' && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonthOffset(m => m - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
                  {rangeLabel}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setMonthOffset(m => m + 1)}
                  disabled={monthOffset >= 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Rango personalizado */}
            {mode === 'custom' && (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Desde</span>
                  <Input
                    type="date" className="h-8 w-36 text-sm"
                    value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    max={customTo}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Hasta</span>
                  <Input
                    type="date" className="h-8 w-36 text-sm"
                    value={customTo} onChange={e => setCustomTo(e.target.value)}
                    min={customFrom}
                    max={toYMD(new Date())}
                  />
                </div>
                <span className="text-xs text-gray-400">{rangeLabel}</span>
              </div>
            )}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Filter className="h-4 w-4 text-gray-400 shrink-0" />
            {[
              ['Ventas',   showVentas,  setShowVentas,  'bg-green-100 text-green-700 border-green-300'  ],
              ['Gastos',   showGastos,  setShowGastos,  'bg-red-100   text-red-700   border-red-300'    ],
              ['Cambios',  showCambios, setShowCambios, 'bg-violet-100 text-violet-700 border-violet-300'],
              ['Retiros',  showRetiros, setShowRetiros, 'bg-orange-100 text-orange-700 border-orange-300'],
            ].map(([label, val, setter, colors]) => (
              <button
                key={label as string}
                onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(v => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all
                  ${val ? colors : 'bg-gray-50 text-gray-400 border-gray-200'}`}
              >
                {label as string}
              </button>
            ))}
            {allBranchesForDetail.length > 1 && (
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="h-7 text-xs border border-gray-200 rounded-md px-2 bg-white text-gray-600"
              >
                <option value="__all__">Todas las sucursales</option>
                {allBranchesForDetail.map(b => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            )}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            {!loading && (
              <span className="text-gray-400 ml-auto">
                {sorted.length} movimiento{sorted.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── Encabezado de impresión (solo visible al imprimir) ── */}
        <div className="hidden print-block text-center mb-4">
          <p className="text-lg font-bold">Movimientos de Caja</p>
          <p className="text-sm text-gray-600">{rangeLabel}</p>
        </div>

        {/* ── Tabla resumen por sucursal ── */}
        {branchTotals.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Resumen del período
            </p>
            <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Sucursal</th>
                    <th className="text-right px-3 py-2.5">Efectivo</th>
                    <th className="text-right px-3 py-2.5">Débito</th>
                    <th className="text-right px-3 py-2.5">Crédito</th>
                    <th className="text-right px-3 py-2.5">QR/MP</th>
                    <th className="text-right px-3 py-2.5">Transferencia</th>
                    <th className="text-right px-4 py-2.5">Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {branchTotals.map(bt => (
                    <tr key={bt.branch_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{bt.branch_name}</td>
                      {[bt.efectivo, bt.debito, bt.credito, bt.mp, bt.transferencia].map((v, i) => (
                        <td key={i} className={`px-3 py-2.5 text-right tabular-nums text-xs
                          ${v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                          {fmtAmt(v)}
                        </td>
                      ))}
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums
                        ${bt.total >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmtAmtFull(bt.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {branchTotals.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td className="px-4 py-2.5 text-gray-700">TOTAL</td>
                      {[grandTotal.efectivo, grandTotal.debito, grandTotal.credito, grandTotal.mp, grandTotal.transferencia].map((v, i) => (
                        <td key={i} className={`px-3 py-2.5 text-right tabular-nums text-xs
                          ${v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                          {fmtAmt(v)}
                        </td>
                      ))}
                      <td className={`px-4 py-2.5 text-right font-bold tabular-nums
                        ${grandTotal.total >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmtAmtFull(grandTotal.total)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── Detalle por sucursal ── */}
        {loading && sorted.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" /> Cargando movimientos…
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <p className="font-medium text-gray-500">Sin movimientos en este período</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Detalle de movimientos por sucursal
            </p>

            {allBranchesForDetail
              .filter(b => branchFilter === '__all__' || String(b.id) === branchFilter)
              .map(branch => {
                const isCajaCentral = branch.id === 0
                const branchMovements = sorted.filter(m => m.branch_id === branch.id)
                const branchSessions  = sessionsByBranch.get(branch.id) ?? []
                const branchFirst     = branchSessions[0] ?? null
                const branchLast      = branchSessions[branchSessions.length - 1] ?? null
                const openingBal      = branchFirst?.opening_balance ?? 0
                const bEfectivo       = branchMovements.reduce((s, m) => s + m.efectivo, 0)
                const bDebito         = branchMovements.reduce((s, m) => s + m.debito, 0)
                const bCredito        = branchMovements.reduce((s, m) => s + m.credito, 0)
                const bMp             = branchMovements.reduce((s, m) => s + m.mp, 0)
                const bTransf         = branchMovements.reduce((s, m) => s + m.transferencia, 0)
                const bTotal          = branchMovements.reduce((s, m) => s + m.total, 0)
                const bExpected       = openingBal + bEfectivo
                const bClosing        = branchLast?.closing_balance ?? null
                const bMismatch       = bClosing !== null && Math.abs(bExpected - bClosing) > 1
                const hasClosing      = !isCajaCentral && branchLast !== null

                if (branchMovements.length === 0 && !branchFirst) return null

                return (
                  <div key={branch.id}>
                    {/* Encabezado de la sucursal */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{isCajaCentral ? '🏛️' : '📍'}</span>
                      <p className="font-semibold text-gray-800">{branch.name}</p>
                      <span className="text-xs text-gray-400">
                        {branchMovements.length} movimiento{branchMovements.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <SortTh field="datetime"      label="Fecha"    sort={sortField} dir={sortDir} onSort={handleSort} />
                            <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hora</th>
                            <SortTh field="type"          label="Tipo"     sort={sortField} dir={sortDir} onSort={handleSort} />
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuario</th>
                            <SortTh field="efectivo"      label="Efectivo" sort={sortField} dir={sortDir} onSort={handleSort} right />
                            <SortTh field="debito"        label="Débito"   sort={sortField} dir={sortDir} onSort={handleSort} right />
                            <SortTh field="credito"       label="Crédito"  sort={sortField} dir={sortDir} onSort={handleSort} right />
                            <SortTh field="mp"            label="QR/MP"    sort={sortField} dir={sortDir} onSort={handleSort} right />
                            <SortTh field="transferencia" label="Transf."  sort={sortField} dir={sortDir} onSort={handleSort} right />
                            <SortTh field="total"         label="Total"    sort={sortField} dir={sortDir} onSort={handleSort} right />
                          </tr>
                        </thead>

                        {/* Fila de apertura (solo sucursales reales con sesión) */}
                        {!isCajaCentral && branchFirst && (
                          <tbody>
                            <tr className="bg-green-50/80 border-b border-green-100">
                              <td className="pl-4 pr-2 py-2 text-xs text-gray-500 whitespace-nowrap">{fmtDateShort(branchFirst.opened_at)}</td>
                              <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{fmtHour(branchFirst.opened_at)}</td>
                              <td className="px-2 py-2">
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                                  <Unlock className="h-3 w-3" /> Apertura
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-xs">Apertura de caja</td>
                              <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{branchFirst.opened_by ?? '—'}</td>
                              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-green-700">{fmtAmt(openingBal)}</td>
                              {['d','c','m','t'].map(k => <td key={k} className="px-3 py-2 text-right text-xs text-gray-300">—</td>)}
                              <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-green-700">{fmtAmt(openingBal)}</td>
                            </tr>
                          </tbody>
                        )}

                        {/* Movimientos de la sucursal */}
                        <tbody className="divide-y divide-gray-50">
                          {branchMovements.map(m => {
                            const cfg = TYPE_CONFIG[m.type]
                            return (
                              <tr key={`${m.type}-${m.source_id}`} className="hover:bg-gray-50 transition-colors">
                                <td className="pl-4 pr-2 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDateShort(m.datetime)}</td>
                                <td className="px-2 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtHour(m.datetime)}</td>
                                <td className="px-2 py-2.5">
                                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg}`}>
                                    <cfg.Icon className="h-3 w-3" /> {cfg.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-700 max-w-xs">
                                  <p className="truncate">{m.description}</p>
                                  {m.notes && <p className="text-xs text-gray-400 truncate">{m.notes}</p>}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                                  {m.user_name || <span className="text-gray-300">—</span>}
                                </td>
                                {[m.efectivo, m.debito, m.credito, m.mp, m.transferencia].map((v, i) => (
                                  <td key={i} className={`px-3 py-2.5 text-right text-xs tabular-nums whitespace-nowrap
                                    ${v > 0 ? 'text-green-700' : v < 0 ? 'text-red-500' : 'text-gray-300'}`}>
                                    {fmtAmt(v)}
                                  </td>
                                ))}
                                <td className={`px-4 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap
                                  ${m.total > 0 ? 'text-green-700' : m.total < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {fmtAmt(m.total, true)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>

                        {/* Totales + cierre de la sucursal */}
                        <tfoot>
                          {/* Total de movimientos (incl. apertura para sucursales reales) */}
                          <tr className="border-t-2 border-gray-300 bg-gray-100 font-semibold text-sm">
                            <td colSpan={4} className="px-4 py-2.5 text-gray-700">
                              Total {branch.name}
                              {!isCajaCentral && branchFirst && (
                                <span className="text-xs font-normal text-gray-400 ml-1">(incl. apertura)</span>
                              )}
                            </td>
                            <td className="px-2 py-2.5" />
                            <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-bold
                              ${(openingBal + bEfectivo) > 0 ? 'text-green-700' : (openingBal + bEfectivo) < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                              {fmtAmt(openingBal + bEfectivo)}
                            </td>
                            {[bDebito, bCredito, bMp, bTransf].map((v, i) => (
                              <td key={i} className={`px-3 py-2.5 text-right tabular-nums text-xs
                                ${v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                {fmtAmt(v)}
                              </td>
                            ))}
                            <td className={`px-4 py-2.5 text-right font-bold tabular-nums
                              ${(bTotal + openingBal) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {fmtAmtFull(bTotal + openingBal)}
                            </td>
                          </tr>

                          {/* Cierre (solo sucursales reales con sesión) */}
                          {hasClosing && (
                            branchLast!.closed_at ? (
                              <>
                                <tr className={`border-t font-semibold text-sm ${bMismatch ? 'bg-red-50' : 'bg-blue-50/60'}`}>
                                  <td className="pl-4 pr-2 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDateShort(branchLast!.closed_at!)}</td>
                                  <td className="px-2 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtHour(branchLast!.closed_at!)}</td>
                                  <td className="px-2 py-2.5">
                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                                      ${bMismatch ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                      <Lock className="h-3 w-3" /> Cierre
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-xs text-gray-600">Valores en caja al cierre</td>
                                  <td className="px-3 py-2.5 text-xs text-gray-500">{branchLast!.closed_by ?? '—'}</td>
                                  <td className={`px-3 py-2.5 text-right text-sm font-bold tabular-nums ${bMismatch ? 'text-red-600' : 'text-blue-700'}`}>
                                    {fmtAmt(bClosing ?? 0)}
                                  </td>
                                  {['','','',''].map((_, i) => <td key={i} className="px-3 py-2.5 text-right text-gray-300 text-xs">—</td>)}
                                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${bMismatch ? 'text-red-600' : 'text-blue-700'}`}>
                                    {fmtAmt(bClosing ?? 0)}
                                  </td>
                                </tr>
                                <tr className={bMismatch ? 'bg-red-100' : 'bg-green-50'}>
                                  <td colSpan={11} className="px-4 py-2">
                                    {bMismatch ? (
                                      <div className="flex items-center gap-2 text-red-700 text-sm font-semibold">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        Diferencia:{' '}
                                        <span className="font-bold">{fmtAmtFull((bClosing ?? 0) - bExpected)}</span>
                                        <span className="font-normal text-xs text-red-600 ml-1">
                                          (esperado {fmtAmtFull(bExpected)} · contado {fmtAmtFull(bClosing ?? 0)})
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-green-700 text-xs">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Efectivo cuadra — esperado {fmtAmtFull(bExpected)}, contado {fmtAmtFull(bClosing ?? 0)}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              </>
                            ) : (
                              <tr className="bg-amber-50 border-t">
                                <td colSpan={11} className="px-4 py-2.5">
                                  <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                                    <Unlock className="h-4 w-4" />
                                    Caja aún no cerrada — efectivo esperado: {fmtAmtFull(bExpected)}
                                  </div>
                                </td>
                              </tr>
                            )
                          )}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* ── CSS de impresión ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-block { display: block !important; }
          body { background: white !important; }
          @page { size: A4 landscape; margin: 10mm; }
          table { font-size: 10pt; }
          th, td { padding: 4px 6px !important; }
        }
        .print-block { display: none; }
      `}</style>
    </div>
  )
}
