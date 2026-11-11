/**
 * app/robots.ts — robots.txt dinámico multi-tenant.
 *
 * Permite que Google rastree la tienda pública (/tienda o /store)
 * y bloquea el panel de admin y rutas de proceso (checkout, tracking).
 */
import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { getStoreBaseUrl } from '@/lib/store-base-url'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs      = await headers()
  const rawHost   = hdrs.get('host') ?? ''
  const cleanHost = rawHost.replace(/^www\./, '').replace(/:\d+$/, '')

  let baseUrl   = `https://${cleanHost}`
  let storePath = '/tienda'

  try {
    const businessId = await resolveBusinessFromHost(rawHost)
    const [s, resolvedBase] = await Promise.all([
      getPublicSettingsByKeys(businessId, ['locale']),
      getStoreBaseUrl(businessId, rawHost),
    ])
    const locale = s['locale'] ?? 'es-AR'
    storePath = locale.startsWith('en') ? '/store' : '/tienda'
    baseUrl = resolvedBase
  } catch {
    // fallback: /tienda en el dominio del request
  }

  // Construir allow/disallow una sola vez: se reusan en el grupo * y en los bots
  // específicos (un grupo con user-agent propio reemplaza al * para ese bot, así
  // que tiene que tener las mismas reglas completas).
  const allowPaths = [
    storePath,
    `${storePath}/`,
    '/sitemap.xml',
    '/api/images/',   // fotos de producto (Googlebot-Image y Merchant Center)
    '/_next/static/', // CSS/JS de Next.js (renderización de páginas de producto)
    '/_next/image',
    '/favicon',
  ]
  const disallowPaths = [
    `${storePath}/checkout`,
    `${storePath}/tracking`,
    '/api/',
    '/',  // bloquea todo lo demás (panel admin, login, etc.)
  ]

  return {
    rules: [
      {
        userAgent: '*',
        allow:    allowPaths,
        disallow: disallowPaths,
      },
      {
        // Merchant Center usa Storebot-Google; reglas explícitas para no depender de *
        userAgent: ['Googlebot', 'Googlebot-Image', 'Storebot-Google'],
        allow:    allowPaths,
        disallow: disallowPaths,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
