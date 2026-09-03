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
 *
 * Nota: Los productos son modal-based (sin URL propia), por lo que no
 * se incluyen como entradas individuales.
 */

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'

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
  const settings = await getPublicSettingsByKeys(businessId, [
    'locale',
    'catalog_base_url',
  ]).catch(() => ({} as Record<string, string | null>))

  const locale    = settings['locale'] ?? 'es-AR'
  const storePath = locale.startsWith('en') ? '/store' : '/tienda'

  // catalog_base_url tiene el dominio canonical (ej: https://malema.com.ar)
  // Fallback: construir desde el host del request
  const baseUrl = (settings['catalog_base_url'] ?? `https://${cleanHost}`)
    .replace(/\/$/, '')

  const entries: MetadataRoute.Sitemap = []

  // ── 1. Home de la tienda ─────────────────────────────────────────────────────
  entries.push({
    url:             `${baseUrl}${storePath}`,
    lastModified:    new Date(),
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

  return entries
}
