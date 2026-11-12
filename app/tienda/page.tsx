/**
 * app/tienda/page.tsx — Server Component (home del catálogo)
 *
 * Genera el JSON-LD ItemList (solo URLs) para que Google indexe
 * el catálogo completo sin Product+Offer duplicados.
 * El catálogo interactivo lo renderiza TiendaCatalog (Client Component).
 */

import { headers }              from 'next/headers'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { getStoreBaseUrl }      from '@/lib/store-base-url'
import pool                     from '@/lib/db'
import TiendaCatalog            from './_catalog'

export default async function TiendaPage() {
  const h    = await headers()
  const host = h.get('host') ?? 'localhost'

  let itemListScript: React.ReactNode = null

  try {
    const businessId = await resolveBusinessFromHost(host)
    const [s, baseUrl] = await Promise.all([
      getPublicSettingsByKeys(businessId, ['locale']),
      getStoreBaseUrl(businessId, host),
    ])
    const locale    = s['locale'] ?? 'es-AR'
    const storePath = locale.startsWith('en') ? '/store' : '/tienda'
    const storeUrl  = `${baseUrl}${storePath}`

    const { rows } = await pool.query<{ slug: string }>(
      `SELECT slug FROM products
       WHERE business_id = $1 AND exportable_web = true AND slug IS NOT NULL
       ORDER BY category_id NULLS LAST, name`,
      [businessId]
    ).catch(() => ({ rows: [] as { slug: string }[] }))

    if (rows.length > 0) {
      const itemList = {
        '@context': 'https://schema.org',
        '@type':    'ItemList',
        itemListElement: rows.map((p, i) => ({
          '@type':    'ListItem',
          position:   i + 1,
          url:        `${storeUrl}/item/${p.slug}`,
        })),
      }
      itemListScript = (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
        />
      )
    }
  } catch {
    // fallback: sin ItemList
  }

  return (
    <>
      {itemListScript}
      <TiendaCatalog />
    </>
  )
}
