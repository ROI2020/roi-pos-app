import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/v1/feeds/[feed]?token=XXX
 *
 * Expone el catálogo de productos en formato Google Shopping XML
 * (RSS 2.0 + namespace g:), compatible con:
 *   - Meta Business Suite (WhatsApp Catalog / Instagram Shopping / Facebook Shops)
 *   - TikTok Shop (acepta Google Shopping feed)
 *
 * Feeds disponibles:
 *   meta-catalog.xml   → productos con exportable_whatsapp | instagram | facebook
 *   tiktok-catalog.xml → productos con exportable_web
 *   all-catalog.xml    → todos los productos con cualquier flag activo
 *
 * Seguridad: requiere ?token= coincida con settings.catalog_token.
 *
 * Sincronización recomendada: Meta y TikTok releen cada 1 hora (MVP).
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  const { feed }        = await params
  const { searchParams } = new URL(req.url)
  const token           = searchParams.get('token') ?? ''

  // ── 1. Cargar settings ────────────────────────────────────────────────────
  const { rows: settingRows } = await pool.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings
     WHERE key IN ('catalog_token','catalog_base_url','business_name')`
  )
  const cfg = Object.fromEntries(settingRows.map(r => [r.key, r.value ?? '']))

  // ── 2. Validar token ──────────────────────────────────────────────────────
  if (!cfg.catalog_token || cfg.catalog_token !== token) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const baseUrl      = (cfg.catalog_base_url ?? '').replace(/\/$/, '')
  const businessName = cfg.business_name ?? 'Catálogo'

  // ── 3. Determinar filtro según feed ───────────────────────────────────────
  let whereClause: string
  if (feed === 'tiktok-catalog.xml') {
    whereClause = 'p.exportable_web = true'
  } else if (feed === 'all-catalog.xml') {
    whereClause = '(p.exportable_whatsapp OR p.exportable_instagram OR p.exportable_facebook OR p.exportable_web)'
  } else {
    // meta-catalog.xml (default)
    whereClause = '(p.exportable_whatsapp OR p.exportable_instagram OR p.exportable_facebook)'
  }

  // ── 4. Consulta de variantes exportables ─────────────────────────────────
  const { rows } = await pool.query<{
    variant_id: number
    sku: string
    color: string
    size: string
    product_id: number
    product_name: string
    description: string | null
    price: number
    has_image: boolean
    in_stock: boolean
  }>(
    `SELECT
       pv.id                   AS variant_id,
       pv.sku,
       pv.color,
       pv.size,
       p.id                    AS product_id,
       p.name                  AS product_name,
       p.description,
       p.base_price::float     AS price,
       (p.photo_url IS NOT NULL)                                                AS has_image,
       (EXISTS (
         SELECT 1 FROM branch_inventory bi WHERE bi.product_variant_id = pv.id
       ))                                                                       AS in_stock
     FROM products p
     JOIN product_variants pv ON pv.product_id = p.id
     WHERE ${whereClause}
       AND p.photo_url IS NOT NULL
     ORDER BY p.id, pv.id`
  )

  if (rows.length === 0) {
    // Devolver feed vacío válido
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

  // ── 5. Generar items XML ──────────────────────────────────────────────────
  const items = rows.map(row => {
    const imageUrl   = `${baseUrl}/api/images/products/${row.product_id}`
    const storeLink  = baseUrl || 'https://example.com'
    const availability = row.in_stock ? 'in stock' : 'out of stock'

    // Título descriptivo: Nombre + color (si no es genérico) + talle (si no es X)
    const colorPart = row.color && row.color.toLowerCase() !== 'varios' ? ` - ${row.color}` : ''
    const sizePart  = row.size  && row.size  !== 'X'                   ? ` T.${row.size}`  : ''
    const title     = `${row.product_name}${colorPart}${sizePart}`

    const description = row.description || row.product_name

    return `    <item>
      <g:id>${esc(row.sku)}</g:id>
      <g:item_group_id>${row.product_id}</g:item_group_id>
      <g:title>${cdata(title)}</g:title>
      <g:description>${cdata(description)}</g:description>
      <g:link>${esc(storeLink)}</g:link>
      <g:image_link>${esc(imageUrl)}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${row.price.toFixed(2)} ARS</g:price>
      <g:brand>${cdata(businessName)}</g:brand>
      <g:condition>new</g:condition>
      <g:color>${cdata(row.color)}</g:color>
      <g:size>${esc(row.size)}</g:size>
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${cdata(businessName)}</title>
    <link>${esc(baseUrl)}</link>
    <description>${cdata(businessName)} — Catálogo de productos</description>
${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type':  'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',   // Meta/TikTok releen cada 1 hora
    },
  })
}
