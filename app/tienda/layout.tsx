/**
 * app/tienda/layout.tsx — Server Component (async)
 *
 * Resuelve el negocio desde el dominio (header Host) para obtener
 * locale y currency. Monta tres proveedores en orden:
 *
 *   NextIntlClientProvider → idioma del negocio (es/en)
 *   CurrencyProvider       → formatter de moneda (ARS/USD)
 *   CartProvider           → estado del carrito
 *
 * El dominio → business_id → settings se consulta DIRECTAMENTE en DB
 * (sin HTTP round-trip). Si falla (localhost sin DEV_BUSINESS_ID, dominio
 * no registrado) se usa Spanish/ARS como fallback seguro.
 */

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { CartProvider }       from './_context/cart-context'
import { CurrencyProvider }   from './_context/currency-context'
import { StorePathProvider }  from './_context/store-path-context'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'

export const metadata: Metadata = {
  other: {
    'p:domain_verify': 'a4275ed5f962b5ca74b4a1049334d769',
  },
}

export default async function TiendaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ── Resolver negocio y configuración de idioma/moneda ─────────────────────
  let locale     = 'es'
  let currency   = 'ARS'
  let fullLocale = 'es-AR'
  // x-store-base lo inyecta el middleware: '/store' (en) | '/tienda' (es)
  // Si no está (ej: SSR directo sin middleware), lo derivamos del locale.
  let storeBasePath = '/tienda'

  try {
    const h    = await headers()
    const host = h.get('host') ?? 'localhost'

    // El middleware inyecta x-store-base; usarlo es O(1) y evita una query extra
    const headerBase = h.get('x-store-base')

    const businessId = await resolveBusinessFromHost(host)
    const s = await getPublicSettingsByKeys(businessId, ['locale', 'currency'])

    fullLocale = s.locale   ?? 'es-AR'
    currency   = s.currency ?? 'ARS'
    // 'es-AR' → 'es' | 'en-US' → 'en'  (nombre del archivo en /messages/)
    locale = fullLocale.split('-')[0]

    // Si el middleware ya inyectó el header, confiar en él; sino derivar del locale
    storeBasePath = headerBase ?? (locale === 'en' ? '/store' : '/tienda')
  } catch {
    // Fallback silencioso: Spanish / ARS / /tienda
  }

  // ── Cargar mensajes del idioma resuelto ────────────────────────────────────
  // next-intl v4: importación dinámica desde /messages/<locale>.json
  // Si el archivo no existe para el locale, caemos en 'es'.
  // Si ambos fallan (edge case de bundle) usamos objeto vacío como ultra-fallback.
  let messages: Record<string, unknown> = {}
  try {
    messages = (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>
  } catch {
    try {
      messages = (await import('../../messages/es.json')).default as Record<string, unknown>
    } catch {
      // ultra-fallback: messages vacío — los textos mostrarán la clave
    }
  }

  return (
    <NextIntlClientProvider locale={fullLocale} messages={messages}>
      <StorePathProvider basePath={storeBasePath}>
        <CurrencyProvider currency={currency} locale={fullLocale}>
          <CartProvider>
            {children}
          </CartProvider>
        </CurrencyProvider>
      </StorePathProvider>
    </NextIntlClientProvider>
  )
}
