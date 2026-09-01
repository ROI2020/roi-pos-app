"use client"

/**
 * hooks/use-admin-currency.ts
 *
 * Hook para formateo de moneda en páginas del admin.
 * Lee `currency` y `locale` de /api/settings una sola vez por mount
 * y devuelve un formatter `fmt` consistente con la tienda.
 *
 * Uso:
 *   const { fmt, currency, ready } = useAdminCurrency()
 *   <span>{fmt(order.total)}</span>
 *
 * Mientras carga, `ready` es false y fmt devuelve el número sin formato
 * (nunca tira). Una vez cargado, usa la moneda real del negocio.
 */

import { useState, useEffect } from 'react'
import { createFmt } from '@/lib/currency'

interface AdminCurrencyValue {
  fmt:      (n: number) => string
  currency: string
  locale:   string
  /** false mientras se carga la configuración del negocio */
  ready:    boolean
}

// Caché en módulo para que múltiples componentes en la misma página
// no hagan fetch redundantes (se resetea al recargar la página).
let cachedCurrency = ''
let cachedLocale   = ''
let cachePromise: Promise<void> | null = null

async function loadSettings(): Promise<void> {
  if (cachePromise) return cachePromise
  cachePromise = fetch('/api/settings')
    .then(r => r.ok ? r.json() : {})
    .then((d: Record<string, string | null>) => {
      cachedCurrency = d.currency ?? 'ARS'
      cachedLocale   = d.locale   ?? (cachedCurrency === 'USD' ? 'en-US' : 'es-AR')
    })
    .catch(() => {
      cachedCurrency = 'ARS'
      cachedLocale   = 'es-AR'
    })
  return cachePromise
}

export function useAdminCurrency(): AdminCurrencyValue {
  const [ready,    setReady   ] = useState(!!cachedCurrency)
  const [currency, setCurrency] = useState(cachedCurrency || 'ARS')
  const [locale,   setLocale  ] = useState(cachedLocale   || 'es-AR')

  useEffect(() => {
    if (cachedCurrency) return   // ya cargado por otro componente
    loadSettings().then(() => {
      setCurrency(cachedCurrency)
      setLocale(cachedLocale)
      setReady(true)
    })
  }, [])

  const fmt = createFmt(currency, locale)

  return { fmt, currency, locale, ready }
}
