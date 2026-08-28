"use client"

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createFmt } from '@/lib/currency'

interface CurrencyContextValue {
  /** Formatter de moneda del negocio: createFmt(currency, locale) */
  fmt:      (n: number) => string
  currency: string
  locale:   string
}

const CurrencyContext = createContext<CurrencyContextValue>({
  fmt:      createFmt('ARS', 'es-AR'),
  currency: 'ARS',
  locale:   'es-AR',
})

/**
 * Proveedor de moneda por negocio.
 * Se monta en el layout de la tienda con los valores leídos de settings.
 * Todos los componentes de la tienda usan useCurrency() en lugar de
 * importar fmt desde _utils.ts.
 */
export function CurrencyProvider({
  currency,
  locale,
  children,
}: {
  currency: string
  locale:   string
  children: ReactNode
}) {
  const value = useMemo(
    () => ({ fmt: createFmt(currency, locale), currency, locale }),
    [currency, locale]
  )
  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

/** Hook para acceder al formatter de moneda del negocio actual. */
export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext)
}
