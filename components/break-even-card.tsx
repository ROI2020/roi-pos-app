'use client'

import { useEffect, useState } from 'react'
import { Info, TrendingUp, CheckCircle2, AlertTriangle, Loader2, Scale } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BalancePointData } from '@/app/api/kpi/balance-point/route'

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number) =>
  `${(n * 100).toFixed(1)}%`

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${months[m - 1]}.`
}

// ── DetailRow ─────────────────────────────────────────────────────────────────
function DetailRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-right">
        {value}
        {sub && <span className="text-xs font-normal text-gray-400 ml-1">{sub}</span>}
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function BreakEvenCard() {
  const [data,    setData   ] = useState<BalancePointData | null>(null)
  const [loading, setLoading] = useState(true)
  const [open,    setOpen   ] = useState(false)

  useEffect(() => {
    fetch('/api/kpi/balance-point')
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  // ── Estados vacíos ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 flex items-center justify-center h-40">
      <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
    </div>
  )

  if (!data || data.sin_datos) return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="h-5 w-5 text-violet-600 shrink-0" />
        <h2 className="text-base font-bold text-gray-800">Punto de Equilibrio</h2>
      </div>
      <p className="text-sm text-gray-400 text-center">
        Configurá los tipos de gasto con presupuesto en <strong>Configuración → Gastos</strong>
        {' '}para ver este KPI.
      </p>
    </div>
  )

  const { punto_equilibrio, ventas_mes, progreso_pct, alcanzado,
          dias_restantes, fecha_estimada, margen_pct, sin_datos: _ } = data

  const pct = Math.round(progreso_pct * 100)

  // Color según progreso
  const barColor = alcanzado ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-violet-500'
  const textAccent = alcanzado ? 'text-emerald-600' : 'text-violet-700'

  return (
    <>
      <div className="bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Scale className="h-5 w-5 text-violet-600 shrink-0" />
            <h2 className="text-base font-bold text-gray-800">Punto de Equilibrio</h2>
            <p className="text-xs text-gray-400 mt-0.5">Ventas mínimas para cubrir costos</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            title="Ver detalle técnico"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {/* Valor principal */}
        <div className="text-center">
          <p className={`text-3xl font-bold tabular-nums ${textAccent}`}>
            {fmt(punto_equilibrio)}
          </p>
          {alcanzado ? (
            <div className="flex items-center justify-center gap-1 mt-1 text-emerald-600 text-xs font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              ¡Punto de equilibrio alcanzado este mes!
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">
              Vendido: {fmt(ventas_mes)} · {pct}%
            </p>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1.5">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>

          {/* Info de días */}
          {!alcanzado && punto_equilibrio > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              {margen_pct <= 0 ? (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertTriangle className="h-3 w-3" /> Margen negativo — revisá los costos
                </span>
              ) : dias_restantes !== null ? (
                <>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {dias_restantes === 0 ? 'Hoy' : `En ~${dias_restantes} día${dias_restantes !== 1 ? 's' : ''}`}
                  </span>
                  {fecha_estimada && (
                    <span className="font-medium text-gray-500">
                      {fmtDate(fecha_estimada)}
                    </span>
                  )}
                </>
              ) : (
                <span>Sin proyección aún</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de detalle ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Detalle — Punto de Equilibrio</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">

            {/* Costos fijos */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Costos Fijos Mensuales (presupuesto)
              </p>
              {data.detalle_fijos.length === 0 ? (
                <p className="text-gray-400 text-xs">Sin tipos fijos configurados</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.detalle_fijos.map(f => (
                    <DetailRow key={f.name} label={f.name} value={fmt(f.budget)} />
                  ))}
                  <DetailRow label="TOTAL FIJOS" value={fmt(data.costos_fijos)} />
                </div>
              )}
            </div>

            {/* Margen de contribución */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Margen de Contribución (mes actual)
              </p>
              <div className="divide-y divide-gray-50">
                <DetailRow label="Ventas del mes"             value={fmt(data.ventas_mes)} />
                <DetailRow label="− Costo de mercadería (COGS)" value={fmt(data.cogs)} />
                {data.detalle_variables.map(v => (
                  <DetailRow key={v.name} label={`− ${v.name} (variable)`} value={fmt(v.amount)} />
                ))}
                <DetailRow
                  label="= Margen de Contribución"
                  value={fmt(data.ventas_mes - data.cogs - data.gastos_variables)}
                  sub={`(${fmtPct(data.margen_pct)})`}
                />
              </div>
            </div>

            {/* Fórmula */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cálculo</p>
              <p className="text-xs text-gray-500 font-mono">
                PE = Costos Fijos / MC%
              </p>
              <p className="text-xs text-gray-500 font-mono">
                PE = {fmt(data.costos_fijos)} / {fmtPct(data.margen_pct)} = <strong>{fmt(data.punto_equilibrio)}</strong>
              </p>
            </div>

            {/* Progreso */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Progreso del mes
              </p>
              <div className="divide-y divide-gray-50">
                <DetailRow label="Días transcurridos"     value={`${data.dias_transcurridos}`} />
                <DetailRow label="Ventas acumuladas"      value={fmt(data.ventas_mes)} />
                <DetailRow label="Objetivo (PE)"          value={fmt(data.punto_equilibrio)} />
                <DetailRow label="Avance"                 value={fmtPct(data.progreso_pct)} />
                {!data.alcanzado && data.dias_restantes !== null && (
                  <DetailRow
                    label="Días estimados para alcanzarlo"
                    value={`~${data.dias_restantes}`}
                    sub={data.fecha_estimada ? `(${fmtDate(data.fecha_estimada)})` : undefined}
                  />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
