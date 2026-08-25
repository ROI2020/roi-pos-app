"use client"

import { useState, useEffect, useCallback } from "react"
import { Tag, Percent, DollarSign, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge  } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// ── Types ─────────────────────────────────────────────────────────────────────
interface Promo {
  id:                   number
  name:                 string | null
  summary:              string | null
  detail:               string | null
  discount_type:        string
  value:                number
  days_of_week:         string
  category_name:        string | null
  age_group_name:       string | null
  season_name:          string | null
  gender_name:          string | null
  start_date:           string | null
  end_date:             string | null
  roulette_only:        boolean
  active:               boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAYS = [
  { d: '1', short: 'Lu', long: 'Lunes'     },
  { d: '2', short: 'Ma', long: 'Martes'    },
  { d: '3', short: 'Mi', long: 'Miércoles' },
  { d: '4', short: 'Ju', long: 'Jueves'    },
  { d: '5', short: 'Vi', long: 'Viernes'   },
  { d: '6', short: 'Sa', long: 'Sábado'    },
  { d: '7', short: 'Do', long: 'Domingo'   },
]

function todayDigit(): string {
  const d = new Date().getDay()     // 0 = domingo
  return d === 0 ? '7' : String(d)  // 1=lu … 7=do
}

function discountLabel(p: Promo): string {
  return p.discount_type === 'percentage'
    ? `${p.value}% OFF`
    : `$${p.value.toLocaleString('es-AR')} OFF`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── PromoCard ─────────────────────────────────────────────────────────────────
function PromoCard({ p }: { p: Promo }) {
  const isPercent  = p.discount_type === 'percentage'
  const hasDates   = !!(p.start_date || p.end_date)
  const hasFilters = !!(p.category_name || p.age_group_name || p.season_name || p.gender_name)

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm space-y-2">
      {/* Encabezado: nombre + descuento */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 leading-snug">
            {p.name || p.summary || '—'}
          </p>
          {p.name && p.summary && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{p.summary}</p>
          )}
        </div>
        <Badge
          variant="secondary"
          className={`shrink-0 text-xs font-bold ${
            isPercent ? 'bg-violet-100 text-violet-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {isPercent
            ? <Percent className="h-2.5 w-2.5 mr-1" />
            : <DollarSign className="h-2.5 w-2.5 mr-1" />}
          {discountLabel(p)}
        </Badge>
      </div>

      {/* Filtros de producto */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1">
          {p.category_name  && <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-600">{p.category_name}</Badge>}
          {p.age_group_name && <Badge variant="outline" className="text-[10px]">{p.age_group_name}</Badge>}
          {p.season_name    && <Badge variant="outline" className="text-[10px]">{p.season_name}</Badge>}
          {p.gender_name    && <Badge variant="outline" className="text-[10px]">{p.gender_name}</Badge>}
        </div>
      )}
      {!hasFilters && (
        <p className="text-[11px] text-gray-400">Aplica a todos los productos</p>
      )}

      {/* Vigencia + roulette_only */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {hasDates && (
          <span className="text-[11px] text-gray-400">
            {formatDate(p.start_date)} → {formatDate(p.end_date)}
          </span>
        )}
        {p.roulette_only && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
            🎡 Solo Ruleta
          </span>
        )}
      </div>

      {/* Detalle / condiciones */}
      {p.detail && (
        <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-2 leading-relaxed">
          {p.detail}
        </p>
      )}
    </div>
  )
}

// ── PromosDayDialog ───────────────────────────────────────────────────────────
interface Props {
  open:    boolean
  onClose: () => void
}

export function PromosDayDialog({ open, onClose }: Props) {
  const [promos,   setPromos  ] = useState<Promo[]>([])
  const [loading,  setLoading ] = useState(false)
  const [selDay,   setSelDay  ] = useState<string>(todayDigit)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/promotions?active=true')
      const data = await res.json()
      setPromos(Array.isArray(data) ? data : [])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  // Filtrar por día seleccionado (excluye roulette_only)
  const filtered = promos.filter(p =>
    !p.roulette_only &&
    p.days_of_week.includes(selDay)
  )

  const dayInfo    = DAYS.find(d => d.d === selDay)
  const isToday    = selDay === todayDigit()

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 flex flex-col" style={{ maxHeight: '90vh' }}>
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-800">
              <Tag className="h-4 w-4 text-violet-600" />
              Promos del día
            </DialogTitle>
            <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 w-7 p-0">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Selector de día */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {DAYS.map(day => (
              <button
                key={day.d}
                onClick={() => setSelDay(day.d)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selDay === day.d
                    ? 'bg-violet-600 text-white shadow-sm'
                    : day.d === todayDigit()
                      ? 'bg-violet-50 text-violet-600 border border-violet-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {day.short}
                {day.d === todayDigit() && selDay !== day.d && (
                  <span className="ml-1 text-[8px] font-bold text-violet-500">HOY</span>
                )}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-gray-50/50" style={{ minHeight: 0 }}>
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-2 text-gray-400">
              <Tag className="h-10 w-10 text-gray-200" />
              <p className="text-sm font-medium">
                Sin promos para el {dayInfo?.long ?? 'día seleccionado'}
              </p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-0.5">
                {filtered.length} promo{filtered.length !== 1 ? 's' : ''} para el {dayInfo?.long}
                {isToday && <span className="ml-1.5 text-violet-600">· HOY</span>}
              </p>
              {filtered.map(p => <PromoCard key={p.id} p={p} />)}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2.5 border-t bg-white text-center">
          <p className="text-[10px] text-gray-400">
            Solo se muestran promos activas del día · Las de Ruleta no aparecen aquí
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
