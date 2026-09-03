/**
 * StoreJsonLd — Server Component (sin "use client")
 *
 * Inyecta dos bloques de structured data en el <head> de la tienda:
 *
 *  1. Organization — datos del negocio (nombre, URL, logo)
 *  2. ItemList     — catálogo de productos para que Google indexe
 *                   nombre, descripción, imagen y precio de cada uno,
 *                   aunque no tengan URL propia (modal-based).
 *
 * Máximo 100 productos para mantener el <head> razonable.
 * Las imágenes CJ (general_image_url) son URLs públicas que Google
 * puede rastrear directamente.
 */

import pool from '@/lib/db'
import { getPublicSettingsByKeys } from '@/lib/settings'

interface Props {
  businessId: number
  businessName?: string  // opcional; si no viene se lee desde settings
  baseUrl: string        // ej: https://malema.com.ar
  storePath: string      // '/tienda' | '/store'
  currency: string       // 'ARS' | 'USD'
}

interface ProductRow {
  id:                number
  name:              string
  long_name:         string | null
  slug:              string | null
  description:       string | null
  base_price:        number
  general_image_url: string | null
  photo_url:         string | null
  in_stock:          boolean
}

export default async function StoreJsonLd({
  businessId, businessName: nameProp, baseUrl, storePath, currency,
}: Props) {
  // Resolver businessName si no vino como prop
  const businessName = nameProp || await getPublicSettingsByKeys(businessId, ['business_name'])
    .then(s => s['business_name'] ?? 'Tienda')
    .catch(() => 'Tienda')

  // Traer los primeros 100 productos exportables
  const { rows } = await pool.query<ProductRow>(
    `SELECT
       p.id,
       p.name,
       p.long_name,
       p.slug,
       p.description,
       p.base_price::float,
       p.general_image_url,
       p.photo_url,
       EXISTS (
         SELECT 1 FROM product_variants pv
         JOIN branch_inventory bi ON bi.variant_id = pv.id
         WHERE pv.product_id = p.id
       ) AS in_stock
     FROM products p
     WHERE p.business_id   = $1
       AND p.exportable_web = true
     ORDER BY p.category_id NULLS LAST, p.name
     LIMIT 100`,
    [businessId]
  ).catch(() => ({ rows: [] as ProductRow[] }))

  const storeUrl = `${baseUrl}${storePath}`

  // ── Organization ──────────────────────────────────────────────────────────
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type':    'OnlineStore',
    name:       businessName,
    url:        storeUrl,
  }

  // ── ItemList de productos ──────────────────────────────────────────────────
  const itemList = {
    '@context':       'https://schema.org',
    '@type':          'ItemList',
    name:             `Catálogo ${businessName}`,
    numberOfItems:    rows.length,
    itemListElement:  rows.map((p, i) => {
      // Imagen: preferimos general_image_url (CJ, URL pública directa)
      // Para físicos usamos la URL de la API de imágenes (pública)
      const image = p.general_image_url
        ?? (p.photo_url && p.photo_url.startsWith('http') ? p.photo_url : null)
        ?? `${baseUrl}/api/images/products/${p.id}`

      // Descripción: long_name si difiere del nombre, luego description
      const desc = (p.long_name && p.long_name !== p.name)
        ? p.long_name
        : (p.description ?? undefined)

      const productUrl = p.slug
        ? `${storeUrl}/item/${p.slug}`
        : storeUrl

      return {
        '@type':    'ListItem',
        position:   i + 1,
        item: {
          '@type':       'Product',
          name:          p.name,
          ...(desc          && { description: desc.slice(0, 300) }),
          image,
          url:           productUrl,
          offers: {
            '@type':        'Offer',
            price:          p.base_price.toFixed(2),
            priceCurrency:  currency,
            availability:   'https://schema.org/InStock',
            url:            productUrl,
          },
        },
      }
    }),
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
    </>
  )
}
