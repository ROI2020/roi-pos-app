/**
 * StoreJsonLd — Server Component
 *
 * Inyecta el bloque Organization/OnlineStore en el <head> de TODAS las páginas
 * de la tienda (home, fichas, estáticas).
 *
 * El ItemList de catálogo se genera solo en la home (app/tienda/page.tsx)
 * para evitar que Google vea Product-con-Offer duplicados en cada ficha.
 */

import { getPublicSettingsByKeys } from '@/lib/settings'

interface Props {
  businessId:    number
  businessName?: string  // opcional; si no viene se lee desde settings
  baseUrl:       string  // ej: https://malema.com.ar
  storePath:     string  // '/tienda' | '/store'
  logo?:         string | null
}

export default async function StoreJsonLd({
  businessId, businessName: nameProp, baseUrl, storePath, logo,
}: Props) {
  const businessName = nameProp || await getPublicSettingsByKeys(businessId, ['business_name'])
    .then(s => s['business_name'] ?? 'Tienda')
    .catch(() => 'Tienda')

  const storeUrl = `${baseUrl}${storePath}`

  const orgSchema = {
    '@context': 'https://schema.org',
    '@type':    'OnlineStore',
    name:       businessName,
    url:        storeUrl,
    ...(logo && { logo }),
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
    />
  )
}
