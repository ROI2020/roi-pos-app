/**
 * lib/currency.ts — Formateo de moneda por negocio
 *
 * Usa los settings del negocio (currency + locale) para formatear precios.
 * Úsalo en server components, rutas API y componentes de la tienda pública.
 *
 * Para el admin / POS (siempre ARS·es-AR) los componentes pueden seguir
 * usando sus Intl.NumberFormat locales sin cambios.
 *
 * Flujo típico en la tienda:
 *   1. El catálogo devuelve store.currency y store.locale
 *   2. El componente padre llama createFmt(store.currency, store.locale)
 *   3. Pasa el formatter como prop a sus hijos
 *
 * @example
 *   const fmt = createFmt('USD', 'en-US')
 *   fmt(1500) // '$1,500'
 *
 *   const fmt = createFmt('ARS', 'es-AR')
 *   fmt(1500) // '$1.500'
 */

export interface CurrencyConfig {
  currency: string  // ISO 4217: 'ARS', 'USD', 'EUR', …
  locale:   string  // BCP 47:   'es-AR', 'en-US', …
}

/**
 * Monedas sin centavos habituales en e-commerce latinoamericano.
 * Para estas se formatea sin decimales (ej: $1.500).
 * El resto (USD, EUR, etc.) se formatea con 2 decimales (ej: $15.99).
 */
const NO_DECIMALS = new Set(['ARS', 'CLP', 'COP', 'PYG', 'UYU', 'BOB', 'VES'])

/**
 * Crea un formatter de moneda eficiente (reutiliza Intl internamente).
 * - ARS y otras monedas latinoamericanas: sin decimales ($1.500)
 * - USD, EUR, etc.: con 2 decimales ($15.99)
 */
export function createFmt(currency: string, locale: string): (amount: number) => string {
  const maxFrac = NO_DECIMALS.has(currency.toUpperCase()) ? 0 : 2
  const formatter = new Intl.NumberFormat(locale, {
    style:                 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  })
  return (amount: number) => formatter.format(amount)
}

/**
 * Formatea un monto directamente sin necesidad de crear el formatter antes.
 * Conveniente para usos aislados; si formateás muchos montos, usá createFmt().
 */
export function formatCurrency(amount: number, config: CurrencyConfig): string {
  const maxFrac = NO_DECIMALS.has(config.currency.toUpperCase()) ? 0 : 2
  return new Intl.NumberFormat(config.locale, {
    style:                 'currency',
    currency:              config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  }).format(amount)
}

/**
 * Devuelve el símbolo visible de la moneda para usar en labels de UI.
 * Ejemplos: '$' (ARS/USD en es-AR), 'US$' (USD en es-AR), '$' (USD en en-US)
 */
export function getCurrencySymbol(config: CurrencyConfig): string {
  return (
    new Intl.NumberFormat(config.locale, {
      style:                 'currency',
      currency:              config.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .formatToParts(1)
      .find(p => p.type === 'currency')?.value ?? config.currency
  )
}
