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
import StoreJsonLd from './_components/store-jsonld'
import './store-theme.css'

// ── Metadata dinámica por negocio ──────────────────────────────────────────────
export async function generateMetadata(): Promise<Metadata> {
  try {
    const h    = await headers()
    const host = h.get('host') ?? 'localhost'
    const businessId = await resolveBusinessFromHost(host)
    const s = await getPublicSettingsByKeys(businessId, [
      'business_name', 'catalog_description', 'catalog_base_url',
      'business_logo', 'locale', 'catalog_pinterest_verify',
    ])

    const name      = s['business_name']      ?? 'Tienda'
    const locale    = s['locale']             ?? 'es-AR'
    const descFallback = locale.startsWith('en')
      ? `Shop ${name} — fast shipping across the US`
      : `Comprá en ${name} — envíos a todo el país`
    const desc      = s['catalog_description'] ?? descFallback
    const storePath = locale.startsWith('en') ? '/store' : '/tienda'
    const baseUrl   = (s['catalog_base_url'] ?? `https://${host}`).replace(/\/$/, '')
    const canonical = `${baseUrl}${storePath}`
    const logo      = s['business_logo'] ?? null

    // Favicon: se usa la URL tal cual está en settings.
    // - URL absoluta (https://...): funciona en dev y prod.
    // - Ruta relativa (/api/images/...): el browser la resuelve solo, sin necesitar baseUrl.
    //   No construir https://localhost:3000/... porque dev corre en http, no https.
    const faviconUrl = logo || null

    return {
      metadataBase: new URL(baseUrl || `https://${host}`),
      title:       name,   // en la pestaña: "MALEMA" (limpio, sin sufijo)
      description: desc,
      alternates:  { canonical },
      // Favicon por negocio — sobreescribe el /favicon.png del root layout
      ...(faviconUrl && {
        icons: {
          icon:       faviconUrl,
          shortcut:   faviconUrl,
          apple:      faviconUrl,
        },
      }),
      openGraph: {
        type:        'website',
        url:         canonical,
        siteName:    name,
        title:       `${name} — tienda online`,
        description: desc,
        locale:      locale.replace('-', '_'),
        ...(logo && { images: [{ url: logo, alt: name }] }),
      },
      twitter: {
        card:        'summary',
        title:       `${name} — tienda online`,
        description: desc,
        ...(logo && { images: [logo] }),
      },
      // Pinterest domain verification — por negocio desde settings
      ...(s['catalog_pinterest_verify'] && {
        other: { 'p:domain_verify': s['catalog_pinterest_verify'] },
      }),
    }
  } catch {
    // Fallback mínimo si el tenant no resuelve
    return { title: 'Tienda' }
  }
}

export default async function TiendaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ── Resolver negocio y configuración de idioma/moneda ─────────────────────
  let locale      = 'es'
  let currency    = 'ARS'
  let fullLocale  = 'es-AR'
  let themeStyle  = ''          // CSS con variables del tema por negocio
  // x-store-base lo inyecta el middleware: '/store' (en) | '/tienda' (es)
  // Si no está (ej: SSR directo sin middleware), lo derivamos del locale.
  let storeBasePath = '/tienda'
  let businessId_: number | null = null
  let baseUrl_    = ''

  try {
    const h    = await headers()
    const host = h.get('host') ?? 'localhost'

    // El middleware inyecta x-store-base; usarlo es O(1) y evita una query extra
    const headerBase = h.get('x-store-base')

    const businessId = await resolveBusinessFromHost(host)
    businessId_ = businessId
    const s = await getPublicSettingsByKeys(businessId, [
      'locale', 'currency',
      'catalog_base_url',
      'catalog_color_primary', 'catalog_color_secondary',
      'catalog_color_bg', 'catalog_color_surface', 'catalog_color_text',
      'catalog_color_muted', 'catalog_color_border', 'catalog_font',
    ])
    baseUrl_ = (s['catalog_base_url'] ?? `https://${host}`).replace(/\/$/, '')

    fullLocale = s.locale   ?? 'es-AR'
    currency   = s.currency ?? 'ARS'
    // 'es-AR' → 'es' | 'en-US' → 'en'  (nombre del archivo en /messages/)
    locale = fullLocale.split('-')[0]

    // Si el middleware ya inyectó el header, confiar en él; sino derivar del locale
    storeBasePath = headerBase ?? (locale === 'en' ? '/store' : '/tienda')

    // ── Tema visual por negocio ──────────────────────────────────
    // Construye CSS custom properties a partir de los settings
    const font = s.catalog_font?.trim() ?? ''
    const cssImport = font
      ? `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700;800&display=swap');\n`
      : ''
    const cssVars = [
      s.catalog_color_primary   && `--store-primary:${s.catalog_color_primary};`,
      s.catalog_color_secondary && `--store-secondary:${s.catalog_color_secondary};`,
      s.catalog_color_bg        && `--store-bg:${s.catalog_color_bg};`,
      s.catalog_color_surface   && `--store-surface:${s.catalog_color_surface};`,
      s.catalog_color_text      && `--store-text:${s.catalog_color_text};`,
      s.catalog_color_muted     && `--store-muted:${s.catalog_color_muted};`,
      s.catalog_color_border    && `--store-border:${s.catalog_color_border};`,
      font && `--store-font:'${font}',system-ui,-apple-system,sans-serif;`,
    ].filter(Boolean).join('')

    if (cssImport || cssVars) {
      themeStyle = `${cssImport}${cssVars ? `:root{${cssVars}}` : ''}`
    }
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
      {/* Inyectar variables CSS del tema antes que cualquier componente */}
      {themeStyle && (
        // eslint-disable-next-line react/no-danger
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
      )}

      {/* JSON-LD structured data: Organization + ItemList de productos */}
      {businessId_ !== null && (
        <StoreJsonLd
          businessId={businessId_}
          businessName={''}   // se lee internamente desde el name del producto
          baseUrl={baseUrl_ || `https://localhost`}
          storePath={storeBasePath}
          currency={currency}
        />
      )}

      <StorePathProvider basePath={storeBasePath}>
        <CurrencyProvider currency={currency} locale={fullLocale}>
          <CartProvider businessId={businessId_}>
            {children}
          </CartProvider>
        </CurrencyProvider>
      </StorePathProvider>
    </NextIntlClientProvider>
  )
}
