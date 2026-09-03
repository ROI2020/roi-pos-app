import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/v1/feeds/[feed]?token=XXX
 *
 * Catálogo de productos en Google Shopping XML (RSS 2.0 + namespace g:).
 * Compatible con Google Merchant Center, Meta Business Suite y TikTok Shop.
 *
 * Feeds disponibles:
 *   meta-catalog.xml   → productos con exportable_whatsapp | instagram | facebook
 *   google-catalog.xml → productos con exportable_web (con URL individual si existe slug)
 *   tiktok-catalog.xml → alias de google-catalog.xml (mismo formato, mismo filtro)
 *   all-catalog.xml    → todos los productos con cualquier flag activo
 *
 * Seguridad: el token identifica al negocio. Si no coincide → 401.
 * Multi-tenant: business_id se resuelve desde el token, no desde el host.
 */

// ── Helpers XML ────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cdata(s: string | null | undefined): string {
  return `<![CDATA[${(s ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ feed: string }> }
) {
  const { feed }         = await params
  const { searchParams } = new URL(req.url)
  const token            = searchParams.get('token') ?? ''

  if (!token) {
    return new NextResponse('token requerido', { status: 401 })
  }

  // ── 1. Resolver negocio desde el token ────────────────────────────────────
  // El token es único por negocio → identifica el business_id sin depender del host.
  const { rows: tokenRows } = await pool.query<{ business_id: number }>(
    `SELECT business_id FROM settings
     WHERE key = 'catalog_token' AND value = $1
     LIMIT 1`,
    [token]
  )
  if (!tokenRows.length) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const businessId = tokenRows[0].business_id

  // ── 2. Cargar settings del negocio ────────────────────────────────────────
  const { rows: settingRows } = await pool.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings
     WHERE business_id = $1
       AND key IN ('catalog_base_url','business_name','locale','currency')`,
    [businessId]
  )
  const cfg = Object.fromEntries(settingRows.map(r => [r.key, r.value ?? '']))

  const baseUrl      = (cfg.catalog_base_url ?? '').replace(/\/$/, '')
  const businessName = cfg.business_name ?? 'Catálogo'
  const locale       = cfg.locale        ?? 'es-AR'
  const currency     = cfg.currency      ?? 'ARS'
  const storePath    = locale.startsWith('en') ? '/store' : '/tienda'

  // ── 3. Filtro según feed ──────────────────────────────────────────────────
  let whereClause: string
  if (feed === 'meta-catalog.xml') {
    whereClause = '(p.exportable_whatsapp OR p.exportable_instagram OR p.exportable_facebook)'
  } else if (feed === 'all-catalog.xml') {
    whereClause = '(p.exportable_whatsapp OR p.exportable_instagram OR p.exportable_facebook OR p.exportable_web)'
  } else {
    // google-catalog.xml y tiktok-catalog.xml → exportable_web
    whereClause = 'p.exportable_web = true'
  }

  // ── 4. Consulta de productos exportables ─────────────────────────────────
  // Incluye físicos (photo_url) Y dropshipping (general_image_url).
  const { rows } = await pool.query<{
    product_id:        number
    product_name:      string
    description:       string | null
    price:             number
    slug:              string | null
    // Imagen: para físicos = photo_url → sirve via /api/images/products/[id]
    //         para DS  = general_image_url (CDN CJ, URL pública directa para crawlers)
    has_local_photo:   boolean
    general_image_url: string | null
    in_stock:          boolean
  }>(
    `SELECT
       p.id                                                      AS product_id,
       p.name                                                    AS product_name,
       p.description,
       p.base_price::float                                       AS price,
       p.slug,
       (p.photo_url IS NOT NULL)                                 AS has_local_photo,
       p.general_image_url,
       EXISTS (
         SELECT 1 FROM product_variants pv
         JOIN branch_inventory bi ON bi.variant_id = pv.id
         WHERE pv.product_id = p.id
       )                                                         AS in_stock
     FROM products p
     WHERE p.business_id = $1
       AND ${whereClause}
       AND (p.photo_url IS NOT NULL OR p.general_image_url IS NOT NULL)
     ORDER BY p.category_id NULLS LAST, p.name`,
    [businessId]
  )

  // ── 5. Fotos por color (additional_image_link para físicos) ──────────────
  const productIds = rows.map(r => r.product_id)
  const colorImgsByProduct = new Map<number, Map<string, number>>()

  if (productIds.length > 0) {
    const { rows: colorImgRows } = await pool.query<{
      product_id: number; color: string; id: number
    }>(
      `SELECT product_id, color, id
       FROM product_images
       WHERE product_id = ANY($1::int[]) AND color IS NOT NULL
       ORDER BY sort_order, id`,
      [productIds]
    )
    for (const r of colorImgRows) {
      if (!colorImgsByProduct.has(r.product_id)) colorImgsByProduct.set(r.product_id, new Map())
      colorImgsByProduct.get(r.product_id)!.set(r.color, r.id)
    }
  }

  // ── 6. Variantes (color + talle) para productos físicos ──────────────────
  // Para DS usamos un ítem por producto (sin variantes SKU distintas en el feed).
  const { rows: variantRows } = await pool.query<{
    product_id: number; id: number; sku: string; color: string; size: string
    specific_image_url: string | null
  }>(
    `SELECT pv.product_id, pv.id, pv.sku, pv.color, pv.size, pv.specific_image_url
     FROM product_variants pv
     WHERE pv.product_id = ANY($1::int[])
     ORDER BY pv.product_id, pv.id`,
    [productIds]
  )
  // Agrupar variantes por producto
  const variantsByProduct = new Map<number, typeof variantRows>()
  for (const v of variantRows) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, [])
    variantsByProduct.get(v.product_id)!.push(v)
  }

  if (rows.length === 0) {
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(businessName)}</title>
    <link>${esc(baseUrl)}</link>
    <description>Catálogo de productos</description>
  </channel>
</rss>`
    return new NextResponse(emptyXml, {
      headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' },
    })
  }

  // ── 7. Generar ítems XML ──────────────────────────────────────────────────
  const items: string[] = []

  for (const row of rows) {
    const isDS = !!row.general_image_url && !row.has_local_photo

    // URL del producto: individual si tiene slug, sino el home de la tienda
    const productLink = row.slug
      ? `${baseUrl}${storePath}/item/${row.slug}`
      : baseUrl || 'https://example.com'

    // Imagen principal
    const mainImageUrl = row.has_local_photo
      ? `${baseUrl}/api/images/products/${row.product_id}`
      : row.general_image_url ?? ''  // CJ CDN: URL pública directa (crawlers la necesitan así)

    const availability = row.in_stock ? 'in stock' : 'out of stock'
    const description  = row.description || row.product_name

    if (isDS) {
      // ── Producto DS: un solo ítem por producto ──────────────────────────
      items.push(`    <item>
      <g:id>ds-${row.product_id}</g:id>
      <g:item_group_id>${row.product_id}</g:item_group_id>
      <g:title>${cdata(row.product_name)}</g:title>
      <g:description>${cdata(description)}</g:description>
      <g:link>${esc(productLink)}</g:link>
      <g:image_link>${esc(mainImageUrl)}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${row.price.toFixed(2)} ${currency}</g:price>
      <g:brand>${cdata(businessName)}</g:brand>
      <g:condition>new</g:condition>
    </item>`)
    } else {
      // ── Producto físico: un ítem por variante ───────────────────────────
      const variants = variantsByProduct.get(row.product_id) ?? []

      if (variants.length === 0) {
        // Sin variantes cargadas → ítem genérico
        items.push(`    <item>
      <g:id>p-${row.product_id}</g:id>
      <g:item_group_id>${row.product_id}</g:item_group_id>
      <g:title>${cdata(row.product_name)}</g:title>
      <g:description>${cdata(description)}</g:description>
      <g:link>${esc(productLink)}</g:link>
      <g:image_link>${esc(mainImageUrl)}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${row.price.toFixed(2)} ${currency}</g:price>
      <g:brand>${cdata(businessName)}</g:brand>
      <g:condition>new</g:condition>
    </item>`)
      } else {
        for (const v of variants) {
          const colorImgId  = colorImgsByProduct.get(row.product_id)?.get(v.color)
          const variantImg  = colorImgId != null
            ? `${baseUrl}/api/images/product-images/${colorImgId}`
            : (v.specific_image_url || mainImageUrl)

          const colorPart = v.color && v.color.toLowerCase() !== 'varios' ? ` - ${v.color}` : ''
          const sizePart  = v.size  && v.size  !== 'X'                   ? ` T.${v.size}`  : ''
          const title     = `${row.product_name}${colorPart}${sizePart}`

          const additionalImgTag = variantImg && variantImg !== mainImageUrl
            ? `\n      <g:additional_image_link>${esc(mainImageUrl)}</g:additional_image_link>`
            : ''

          items.push(`    <item>
      <g:id>${esc(v.sku)}</g:id>
      <g:item_group_id>${row.product_id}</g:item_group_id>
      <g:title>${cdata(title)}</g:title>
      <g:description>${cdata(description)}</g:description>
      <g:link>${esc(productLink)}</g:link>
      <g:image_link>${esc(variantImg)}</g:image_link>${additionalImgTag}
      <g:availability>${availability}</g:availability>
      <g:price>${row.price.toFixed(2)} ${currency}</g:price>
      <g:brand>${cdata(businessName)}</g:brand>
      <g:condition>new</g:condition>
      <g:color>${cdata(v.color)}</g:color>
      <g:size>${esc(v.size)}</g:size>
    </item>`)
        }
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${cdata(businessName)}</title>
    <link>${esc(baseUrl)}</link>
    <description>${cdata(businessName)} — Catálogo de productos</description>
${items.join('\n')}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type':  'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
