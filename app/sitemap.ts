/**
 * app/sitemap.ts — Sitemap dinámico multi-tenant para Google Search Console.
 *
 * Next.js sirve este archivo en /sitemap.xml automáticamente.
 * El middleware omite rutas con '.' en el path (SKIP_PATHS), por lo que
 * no recibimos x-business-id; resolvemos el tenant directo desde el host.
 *
 * Páginas incluidas:
 *  • Home de la tienda              (priority 1.0, daily)
 *  • store_pages publicadas         (priority 0.6, monthly)
 *  • Productos con slug             (priority 0.8, weekly)
 */

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { getStoreBaseUrl } from '@/lib/store-base-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers()
  const rawHost = hdrs.get('host') ?? ''

  // En local no generamos sitemap (evita ruido en Search Console)
  const cleanHost = rawHost.replace(/^www\./, '').replace(/:\d+$/, '')
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
    return []
  }

  // ── Resolver tenant ──────────────────────────────────────────────────────────
  let businessId: number
  try {
    businessId = await resolveBusinessFromHost(rawHost)
  } catch {
    // Dominio desconocido o sin plan activo → sitemap vacío
    return []
  }

  // ── Settings del negocio ─────────────────────────────────────────────────────
  const [settings, baseUrl] = await Promise.all([
    getPublicSettingsByKeys(businessId, ['locale'])
      .catch(() => ({} as Record<string, string | null>)),
    getStoreBaseUrl(businessId, cleanHost),
  ])

  const locale    = settings['locale'] ?? 'es-AR'
  const storePath = locale.startsWith('en') ? '/store' : '/tienda'

  const entries: MetadataRoute.Sitemap = []

  // ── 1. Home de la tienda ─────────────────────────────────────────────────────
  const { rows: homeRows } = await pool.query<{ lastmod: string | null }>(
    `SELECT MAX(updated_at)::text AS lastmod
     FROM products
     WHERE business_id = $1 AND exportable_web = true`,
    [businessId]
  ).catch(() => ({ rows: [{ lastmod: null }] }))
  const homeLastmod = homeRows[0]?.lastmod ? new Date(homeRows[0].lastmod) : undefined

  entries.push({
    url:             `${baseUrl}${storePath}`,
    ...(homeLastmod && { lastModified: homeLastmod }),
    changeFrequency: 'daily',
    priority:        1.0,
  })

  // ── 2. Páginas de contenido (store_pages) ────────────────────────────────────
  const { rows: pages } = await pool.query<{
    slug:       string
    updated_at: string
  }>(
    `SELECT slug, updated_at
     FROM store_pages
     WHERE business_id = $1
       AND is_published = true
     ORDER BY slug`,
    [businessId]
  ).catch(() => ({ rows: [] }))

  for (const page of pages) {
    entries.push({
      url:             `${baseUrl}${storePath}/p/${page.slug}`,
      lastModified:    new Date(page.updated_at),
      changeFrequency: 'monthly',
      priority:        0.6,
    })
  }

  // ── 3. Productos con URL individual ─────────────────────────────────────────
  const { rows: products } = await pool.query<{
    slug:    string
    lastmod: string | null
  }>(
    `SELECT slug, GREATEST(updated_at, cj_last_sync)::text AS lastmod
     FROM products
     WHERE business_id    = $1
       AND exportable_web = true
       AND slug IS NOT NULL
     ORDER BY category_id NULLS LAST, name`,
    [businessId]
  ).catch(() => ({ rows: [] }))

  for (const p of products) {
    entries.push({
      url:             `${baseUrl}${storePath}/item/${p.slug}`,
      ...(p.lastmod && { lastModified: new Date(p.lastmod) }),
      changeFrequency: 'weekly',
      priority:        0.8,
    })
  }

  return entries
}
