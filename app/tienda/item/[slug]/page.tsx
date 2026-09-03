/**
 * app/tienda/item/[slug]/page.tsx — Página individual de producto (Server Component)
 *
 * Resuelve el producto por slug + business_id (desde el dominio).
 * Genera metadata SEO completa + JSON-LD Product para cada producto.
 * La parte interactiva (galería, selector de color/talle, add-to-cart)
 * la maneja ItemClient (Client Component).
 */

import type { Metadata } from 'next'
import { headers }   from 'next/headers'
import { notFound }  from 'next/navigation'
import Script        from 'next/script'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { toProxyUrl } from '@/lib/proxy-image'
import pool from '@/lib/db'
import ItemClient, { type ItemProduct } from './_client'
import CartDrawer from '../../_components/cart-drawer'

// toProxyUrl importado desde @/lib/proxy-image (maneja alicdn + cjdropshipping → ?u=BASE64URL)

// ── Tipos DB ──────────────────────────────────────────────────────────────────

interface ProductRow {
  id:                 number
  name:               string
  long_name:          string | null
  slug:               string
  description:        string | null
  base_price:         number
  general_image_url:  string | null
  cj_pid:             string | null
  cj_freight_options: object | null
  category:           string | null
  has_image:          boolean
  cj_gallery:         string[] | null
}

interface VariantRow {
  id:                 number
  sku:                string
  color:              string
  size:               string
  specific_image_url: string | null
  in_stock:           boolean
  stock_count:        number
}

interface ColorImgRow {
  color: string | null
  id:    number
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  try {
    const { slug }    = await params
    const h           = await headers()
    const host        = h.get('host') ?? 'localhost'
    const businessId  = await resolveBusinessFromHost(host)
    const s           = await getPublicSettingsByKeys(businessId, [
      'business_name', 'catalog_base_url', 'locale', 'business_logo',
    ])

    const { rows } = await pool.query<Pick<ProductRow, 'id' | 'name' | 'long_name' | 'description' | 'base_price' | 'general_image_url'>>(
      `SELECT id, name, long_name, description, base_price::float, general_image_url
       FROM products
       WHERE business_id = $1 AND slug = $2
       LIMIT 1`,
      [businessId, slug]
    )
    if (!rows.length) return { title: 'Producto no encontrado' }

    const p        = rows[0]
    const bizName  = s['business_name'] ?? 'Tienda'
    const locale   = s['locale'] ?? 'es-AR'
    const stPath   = locale.startsWith('en') ? '/store' : '/tienda'
    const baseUrl  = (s['catalog_base_url'] ?? `https://${host}`).replace(/\/$/, '')
    const canonical = `${baseUrl}${stPath}/item/${slug}`
    const imgUrl   = toProxyUrl(p.general_image_url)
    const logo     = s['business_logo'] ?? null
    // Favicon: URL tal cual (absoluta o relativa). Ver tienda/layout.tsx.
    const faviconUrl = logo || null

    const title = `${p.name} — ${bizName}`
    const desc  = p.description?.slice(0, 160)
      ?? (p.long_name && p.long_name !== p.name ? p.long_name.slice(0, 160) : null)
      ?? `Comprá ${p.name} en ${bizName}`

    return {
      title,
      description: desc,
      alternates: { canonical },
      ...(faviconUrl && {
        icons: { icon: faviconUrl, shortcut: faviconUrl, apple: faviconUrl },
      }),
      openGraph: {
        type:        'website',
        url:         canonical,
        siteName:    bizName,
        title,
        description: desc,
        locale:      locale.replace('-', '_'),
        ...(imgUrl && { images: [{ url: imgUrl, alt: p.name }] }),
      },
      twitter: {
        card:        'summary_large_image',
        title,
        description: desc,
        ...(imgUrl && { images: [imgUrl] }),
      },
    }
  } catch {
    return { title: 'Tienda' }
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProductItemPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug }   = await params
  const h          = await headers()
  const host       = h.get('host') ?? 'localhost'
  const storeBase  = h.get('x-store-base') ?? '/tienda'

  let businessId: number
  try {
    businessId = await resolveBusinessFromHost(host)
  } catch {
    notFound()
  }

  // ── Settings del negocio ──────────────────────────────────────────────────
  const s = await getPublicSettingsByKeys(businessId, [
    'business_name', 'catalog_base_url', 'locale', 'currency',
    'whatsapp_number', 'catalog_cuotas',
    'payment_gateway', 'catalog_envio_info',
  ]).catch(() => ({} as Record<string, string>))

  const locale          = s['locale']          ?? 'es-AR'
  const currency        = s['currency']        ?? 'ARS'
  const cuotas          = parseInt(s['catalog_cuotas'] ?? '0') || 0
  const baseUrl         = (s['catalog_base_url'] ?? `https://${host}`).replace(/\/$/, '')
  const stPath          = locale.startsWith('en') ? '/store' : '/tienda'
  const waRaw           = s['whatsapp_number'] ?? null
  const waNumber        = waRaw ? waRaw.replace(/\D/g, '') : null
  const paymentGateway  = (s['payment_gateway'] ?? 'manual') as 'paypal' | 'mercadopago' | 'manual'
  const shippingInfo    = s['catalog_envio_info'] ?? null

  // ── Producto ──────────────────────────────────────────────────────────────
  const prodRes = await pool.query<ProductRow>(
    `SELECT
       p.id, p.name, p.long_name, p.slug, p.description,
       p.base_price::float,
       p.general_image_url,
       p.cj_pid,
       p.cj_freight_options,
       (p.photo_url IS NOT NULL OR p.general_image_url IS NOT NULL) AS has_image,
       c.name AS category,
       CASE
         WHEN p.cj_data IS NOT NULL AND p.cj_data ? 'productImages'
         THEN ARRAY(SELECT jsonb_array_elements_text(p.cj_data->'productImages'))
         ELSE NULL
       END AS cj_gallery
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.business_id = $1 AND p.slug = $2
     LIMIT 1`,
    [businessId, slug]
  ).catch(() => ({ rows: [] as ProductRow[] }))

  if (!prodRes.rows.length) notFound()
  const prod = prodRes.rows[0]

  // ── Variantes ─────────────────────────────────────────────────────────────
  // branch_inventory columna = product_variant_id (no variant_id), sin columna stock.
  // DS/CJ: in_stock = true siempre (stock gestionado por el proveedor).
  // Físicos: in_stock = EXISTS fila en branch_inventory.
  const isDS = !!prod.cj_pid
  const varRes = await pool.query<VariantRow>(
    `SELECT pv.id, pv.sku, pv.color, pv.size, pv.specific_image_url,
            CASE WHEN $2
              THEN true
              ELSE EXISTS (
                SELECT 1 FROM branch_inventory bi
                WHERE bi.product_variant_id = pv.id
              )
            END AS in_stock,
            CASE WHEN $2
              THEN 999
              ELSE (
                SELECT COUNT(bi.id)::int FROM branch_inventory bi
                WHERE bi.product_variant_id = pv.id
              )
            END AS stock_count
     FROM product_variants pv
     WHERE pv.product_id = $1
     ORDER BY pv.color, pv.size`,
    [prod.id, isDS]
  ).catch(() => ({ rows: [] as VariantRow[] }))

  // ── Imágenes de color (fotos locales por color) ───────────────────────────
  const colorImgRes = await pool.query<ColorImgRow>(
    `SELECT color, id FROM product_images
     WHERE product_id = $1 AND color IS NOT NULL
     ORDER BY sort_order, id`,
    [prod.id]
  ).catch(() => ({ rows: [] as ColorImgRow[] }))

  const imagesByColor: Record<string, string> = {}
  for (const r of colorImgRes.rows) {
    if (r.color && !imagesByColor[r.color]) {
      imagesByColor[r.color] = `/api/images/product-images/${r.id}`
    }
  }

  // ── Galería de imágenes CJ ────────────────────────────────────────────────
  const gallery: string[] = []
  if (prod.general_image_url) {
    const u = toProxyUrl(prod.general_image_url)
    if (u) gallery.push(u)
  }
  if (Array.isArray(prod.cj_gallery)) {
    for (const url of prod.cj_gallery) {
      const u = toProxyUrl(url)
      if (u && !gallery.includes(u)) gallery.push(u)
    }
  }

  // ── Construir ItemProduct ─────────────────────────────────────────────────
  const product: ItemProduct = {
    id:                prod.id,
    name:              prod.name,
    long_name:         prod.long_name,
    slug:              prod.slug,
    description:       prod.description,
    price:             prod.base_price,
    promo_price:       null,   // TODO: promos (misma lógica que catalog)
    today_promo:       null,
    cuotas,
    category:          prod.category,
    has_image:         prod.has_image,
    general_image_url: prod.general_image_url
      ? toProxyUrl(prod.general_image_url)
      : null,
    cj_pid:            prod.cj_pid,
    freight_options:   Array.isArray(prod.cj_freight_options)
      ? prod.cj_freight_options as ItemProduct['freight_options']
      : [],
    gallery,
    variants:          varRes.rows.map(v => ({
      id:                 v.id,
      sku:                v.sku,
      color:              v.color,
      size:               v.size,
      specific_image_url: toProxyUrl(v.specific_image_url),
      in_stock:           v.in_stock,
      stock_count:        v.stock_count,
    })),
    images_by_color: imagesByColor,
  }

  // ── JSON-LD Product (para indexación individual) ──────────────────────────
  const canonical = `${baseUrl}${stPath}/item/${slug}`
  const imgForSchema = prod.general_image_url ?? null

  const productSchema = {
    '@context': 'https://schema.org',
    '@type':    'Product',
    name:       prod.name,
    ...(prod.description && { description: prod.description.slice(0, 300) }),
    ...(imgForSchema && { image: imgForSchema }),
    url:        canonical,
    offers: {
      '@type':       'Offer',
      price:         prod.base_price.toFixed(2),
      priceCurrency: currency,
      availability:  varRes.rows.some(v => v.in_stock)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: canonical,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <CartDrawer />
      <ItemClient
        product={product}
        waNumber={waNumber}
        storePath={storeBase}
        paymentGateway={paymentGateway}
        shippingInfo={shippingInfo}
      />
    </>
  )
}
