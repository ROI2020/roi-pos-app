'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Loader2 } from 'lucide-react'
import type { ExchangeRateData } from '@/app/api/kpi/exchange-rate/route'

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)

const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

const fmtDate = (iso: string) => {
  if (!iso) return ''
  const [, m, d] = iso.split('-').map(Number)
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${months[m - 1]}.`
}

export default function StockUsdCard({ stockCost }: { stockCost: number }) {
  const [tc,    setTc   ] = useState<ExchangeRateData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/kpi/exchange-rate')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setTc)
      .catch(() => setError(true))
  }, [])

  if (!tc && !error) return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-center h-[88px]">
      <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
    </div>
  )

  const usdValue = tc ? stockCost / tc.rate : null

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex items-start gap-3">
      <div className="p-2.5 rounded-lg shrink-0 bg-blue-500">
        <DollarSign className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">Costo del stock en USD</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums leading-tight">
          {error || usdValue === null ? '—' : fmtUSD(usdValue)}
        </p>
        {tc && (
          <p className="text-xs text-gray-400 mt-0.5">
            TC: {fmtARS(tc.rate)} · {fmtDate(tc.fecha)}
          </p>
        )}
        {error && (
          <p className="text-xs text-gray-400 mt-0.5">Sin tipo de cambio disponible</p>
        )}
      </div>
    </div>
  )
}
