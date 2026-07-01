'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type DateMode = 'today' | 'week' | 'month' | 'custom'

// ── Date helpers ───────────────────────────────────────────────────────────────
export const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const fmtShort = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function getTodayRange(): [Date, Date] {
  const start = new Date(); start.setHours(0,0,0,0)
  return [start, new Date()]
}

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

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useDateRange(initialMode: DateMode = 'today') {
  const [mode,        setMode       ] = useState<DateMode>(initialMode)
  const [weekOffset,  setWeekOffset ] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [customFrom,  setCustomFrom ] = useState(toYMD(new Date()))
  const [customTo,    setCustomTo   ] = useState(toYMD(new Date()))

  const [fromDate, toDate] = useMemo<[Date, Date]>(() => {
    if (mode === 'today') return getTodayRange()
    if (mode === 'week')  return getWeekRange(weekOffset)
    if (mode === 'month') return getMonthRange(monthOffset)
    return [new Date(customFrom + 'T00:00:00'), new Date(customTo + 'T23:59:59')]
  }, [mode, weekOffset, monthOffset, customFrom, customTo])

  const fromYMD = toYMD(fromDate)
  const toYMDVal = toYMD(toDate)

  const rangeLabel = useMemo(() => {
    if (mode === 'today') return `Hoy · ${fmtShort(new Date())}`
    if (mode === 'week') {
      const [mon, sun] = getWeekRange(weekOffset)
      return weekOffset === 0
        ? `Esta semana · ${fmtShort(mon)} — ${fmtShort(sun)}`
        : `Semana del ${fmtShort(mon)} al ${fmtShort(sun)}`
    }
    if (mode === 'month') {
      const [first, last] = getMonthRange(monthOffset)
      return monthOffset === 0
        ? `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()} · ${fmtShort(first)} — hoy`
        : `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()} · ${fmtShort(first)} — ${fmtShort(last)}`
    }
    return `${fmtShort(new Date(customFrom+'T00:00:00'))} — ${fmtShort(new Date(customTo+'T00:00:00'))}`
  }, [mode, weekOffset, monthOffset, customFrom, customTo])

  return {
    mode, setMode,
    weekOffset, setWeekOffset,
    monthOffset, setMonthOffset,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    fromYMD, toYMD: toYMDVal,
    rangeLabel,
  }
}

export type DateRangeState = ReturnType<typeof useDateRange>

// ── UI ─────────────────────────────────────────────────────────────────────────
export function DateRangeFilter(props: DateRangeState) {
  const {
    mode, setMode, weekOffset, setWeekOffset, monthOffset, setMonthOffset,
    customFrom, setCustomFrom, customTo, setCustomTo, rangeLabel,
  } = props

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex border rounded-lg overflow-hidden text-sm">
        {([['today','Hoy'],['week','Semana'],['month','Mes'],['custom','Rango']] as [DateMode,string][]).map(([m,lbl]) => (
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

      {mode === 'week' && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">{rangeLabel}</span>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setWeekOffset(w => w + 1)}
            disabled={weekOffset >= 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {mode === 'month' && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonthOffset(m => m - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">{rangeLabel}</span>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setMonthOffset(m => m + 1)}
            disabled={monthOffset >= 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

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
  )
}
