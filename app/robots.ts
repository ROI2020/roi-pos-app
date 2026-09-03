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

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs      = await headers()
  const rawHost   = hdrs.get('host') ?? ''
  const cleanHost = rawHost.replace(/^www\./, '').replace(/:\d+$/, '')

  let baseUrl   = `https://${cleanHost}`
  let storePath = '/tienda'

  try {
    const businessId = await resolveBusinessFromHost(rawHost)
    const s = await getPublicSettingsByKeys(businessId, ['locale', 'catalog_base_url'])
    const locale = s['locale'] ?? 'es-AR'
    storePath = locale.startsWith('en') ? '/store' : '/tienda'
    if (s['catalog_base_url']) baseUrl = s['catalog_base_url'].replace(/\/$/, '')
  } catch {
    // fallback: /tienda en el dominio del request
  }

  return {
    rules: [
      {
        userAgent: '*',
        // Permitir: la tienda completa…
        allow: [`${storePath}/`],
        // …excepto rutas de proceso que no deben indexarse
        disallow: [
          `${storePath}/checkout`,
          `${storePath}/tracking`,
          '/api/',
          '/',  // bloquea todo lo demás (panel admin, login, etc.)
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
