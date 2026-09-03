import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { toProxyUrl, toProxyUrls } from '@/lib/proxy-image'

/**
 * GET /api/catalog
 *
 * Endpoint público — sin autenticación.
 * Resuelve el negocio desde el dominio (header Host) para aislar
 * productos, settings y promos por business_id.
 *
 * Devuelve los productos marcados con exportable_web = true,
 * con sus variantes agrupadas y disponibilidad de stock.
 *
 * También devuelve:
 *  - info pública del negocio (nombre, logo, contacto)
 *  - age_groups únicos que tienen productos en el catálogo (para filtro en Tienda)
 *  - today_promo por producto: promo vigente HOY (no roulette_only) que aplica al producto
 */
export async function GET(req: Request) {
  try {
    // ── Resolver negocio desde el dominio ────────────────────────────────────
    const host = req.headers.get('host') ?? ''
    const businessId = await resolveBusinessFromHost(host)

    // ── Info pública del negocio (solo is_secret=false) ──────────────────────
    const s = await getPublicSettingsByKeys(businessId, [
      'business_name', 'business_logo',
      'receipt_address', 'receipt_phone', 'whatsapp_report_number',
      'catalog_banner', 'catalog_banner_text', 'catalog_envio_info',
      'catalog_phone', 'catalog_cuotas', 'catalog_footer_text', 'catalog_html_banner',
      'catalog_info_items',
      'currency', 'locale',        // para formateo de precios en la tienda
      'payment_gateway',           // 'paypal' | 'mercadopago' | 'manual'
    ])

    // Leer directamente del setting configurado en el panel de pagos.
    const paymentGateway = (s.payment_gateway ?? 'manual') as 'paypal' | 'mercadopago' | 'manual'

    // ── Variantes con stock ───────────────────────────────────────────────
    type CatalogRow = {
      product_id:          number
      product_name:        string
      long_name:           string | null
      description:         string | null
      price:               number
      cuotas:              number
      category:            string | null
      category_id:         number | null
      age_group_id:        number | null
      age_group:           string | null
      season_id:           number | null
      gender_id:           number | null
      has_image:           boolean
      general_image_url:   string | null   // URL CDN de CJ (imagen principal)
      cj_pid:              string | null
      cj_shipping_usd:     number | null
      // productImages[] extraída de cj_data — null si migration no ejecutada o producto no CJ
      cj_gallery:          string[] | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cj_freight_options:  any[] | null
      variant_id:          number
      sku:                 string
      color:               string
      size:                string
      specific_image_url:  string | null
      in_stock:            boolean
      stock_count:         number
    }

    // Query base — siempre funciona (campos cj_* con fallback graceful en try/catch)
    // BASE_SELECT_CORE: campos sin long_name (para fallbacks que no saben si existe la col)
    const BASE_SELECT_CORE = `
       SELECT
         p.id                                                      AS product_id,
         p.name                                                    AS product_name,
         NULL::text                                                AS long_name,
         p.description,`

    // long_name puede no existir si migration 20260902 no se ejecutó — el catch lo maneja con CORE
    const BASE_SELECT = `
       SELECT
         p.id                                                      AS product_id,
         p.name                                                    AS product_name,
         p.long_name,
         p.description,
         p.base_price::float                                       AS price,
         p.cuotas,
         c.name                                                    AS category,
         p.category_id,
         p.age_group_id,
         ag.name                                                   AS age_group,
         p.season_id,
         p.gender_id,
         -- has_image = true si hay foto local O URL CDN de CJ
         (p.photo_url IS NOT NULL OR p.general_image_url IS NOT NULL) AS has_image,
         p.general_image_url,
         pv.id                                                     AS variant_id,
         pv.sku,
         pv.color,
         pv.size,
         pv.specific_image_url`

    const BASE_FROM = `
       FROM products p
       LEFT JOIN categories c  ON c.id  = p.category_id
       LEFT JOIN age_groups  ag ON ag.id = p.age_group_id
       JOIN product_variants pv ON pv.product_id = p.id
       WHERE p.exportable_web = true
         AND p.business_id = $1
       ORDER BY p.category_id NULLS LAST, p.name, p.id, pv.color, pv.size`

    // Intentar query con soporte CJ completo (requiere migrations 20260828 + 20260831)
    let rows: CatalogRow[]
    try {
      const result = await pool.query<CatalogRow>(
        BASE_SELECT + `,
         p.cj_pid,
         -- cj_shipping_usd: null si migration 20260831 no ejecutada (ver catch)
         p.cj_shipping_usd::float                                  AS cj_shipping_usd,
         -- galería de imágenes desde cj_data.productImages (array JSON → texto[])
         CASE
           WHEN p.cj_data IS NOT NULL AND p.cj_data ? 'productImages'
           THEN ARRAY(SELECT jsonb_array_elements_text(p.cj_data->'productImages'))
           ELSE NULL
         END                                                        AS cj_gallery,
         p.cj_freight_options,
         -- CJ dropshipping (cj_pid NOT NULL) = stock virtual ilimitado
         (COALESCE(p.cj_pid, '') <> '' OR EXISTS (
           SELECT 1 FROM branch_inventory bi
           WHERE bi.product_variant_id = pv.id
         ))                                                        AS in_stock,
         CASE
           WHEN COALESCE(p.cj_pid, '') <> '' THEN 9999
           ELSE COALESCE((
             SELECT COUNT(bi.id)::int
             FROM branch_inventory bi
             WHERE bi.product_variant_id = pv.id
           ), 0)
         END                                                       AS stock_count` +
        BASE_FROM,
        [businessId],
      )
      rows = result.rows
    } catch (err) {
      const errStr = String(err)
      // Fallback 1: columna cj_shipping_usd / cj_data / long_name no existen (migration pendiente)
      if (errStr.includes('cj_shipping_usd') || errStr.includes('cj_data') || errStr.includes('long_name')) {
        console.warn('[catalog] Columnas cj_shipping_usd/cj_data no existen. Ejecutar 20260831_cj_data.sql')
        try {
          const result = await pool.query<CatalogRow>(
            BASE_SELECT_CORE + `,
             p.cj_pid,
             NULL::float                                             AS cj_shipping_usd,
             NULL                                                    AS cj_gallery,
             NULL                                                    AS cj_freight_options,
             (COALESCE(p.cj_pid, '') <> '' OR EXISTS (
               SELECT 1 FROM branch_inventory bi
               WHERE bi.product_variant_id = pv.id
             ))                                                      AS in_stock,
             CASE
               WHEN COALESCE(p.cj_pid, '') <> '' THEN 9999
               ELSE COALESCE((
                 SELECT COUNT(bi.id)::int
                 FROM branch_inventory bi
                 WHERE bi.product_variant_id = pv.id
               ), 0)
             END                                                     AS stock_count` +
            BASE_FROM,
            [businessId],
          )
          rows = result.rows
        } catch (err2) {
          if (!String(err2).includes('cj_pid')) throw err2
          throw err2
        }
      } else if (errStr.includes('cj_pid')) {
        // Fallback 2: cj_pid no existe (migration 20260828 pendiente)
        console.warn('[catalog] cj_pid no existe en DB. Ejecutar migration 20260828_cj_dropshipping.sql')
        const result = await pool.query<CatalogRow>(
          BASE_SELECT_CORE + `,
           NULL                                                      AS cj_pid,
           NULL::float                                               AS cj_shipping_usd,
           NULL                                                      AS cj_gallery,
           NULL                                                      AS cj_freight_options,
           (EXISTS (
             SELECT 1 FROM branch_inventory bi
             WHERE bi.product_variant_id = pv.id
           ))                                                        AS in_stock,
           COALESCE((
             SELECT COUNT(bi.id)::int
             FROM branch_inventory bi
             WHERE bi.product_variant_id = pv.id
           ), 0)                                                     AS stock_count` +
          BASE_FROM,
          [businessId],
        )
        rows = result.rows
      } else {
        throw err
      }
    }

    // ── Promos vigentes HOY (no roulette_only, no POS-only) ──────────────
    const dow      = new Date().getDay()
    const dayDigit = dow === 0 ? 7 : dow

    const { rows: promoRows } = await pool.query<{
      id:           number
      summary:      string | null
      discount_type: string
      value:        number
      category_id:  number | null
      age_group_id: number | null
      season_id:    number | null
      gender_id:    number | null
    }>(
      `SELECT id, summary, discount_type, value::float AS value,
              category_id, age_group_id, season_id, gender_id
       FROM promotions
       WHERE business_id = $1
         AND active = true
         AND roulette_only = false
         AND (start_date IS NULL OR start_date <= CURRENT_DATE)
         AND (end_date   IS NULL OR end_date   >= CURRENT_DATE)
         AND days_of_week LIKE $2`,
      [businessId, `%${dayDigit}%`]
    )

    // ── Helper: label del descuento ───────────────────────────────────────
    function discountLabel(promo: typeof promoRows[0]): string {
      if (promo.summary) return promo.summary
      return promo.discount_type === 'percentage'
        ? `${promo.value}% OFF`
        : `$${promo.value.toLocaleString('es-AR')} OFF`
    }

    // ── Helper: primera promo que aplica a un producto ────────────────────
    function matchPromo(
      category_id: number | null,
      age_group_id: number | null,
      season_id: number | null,
      gender_id: number | null,
    ): { summary: string; discount_type: string; value: number } | null {
      const hit = promoRows.find(pr =>
        (pr.category_id  === null || pr.category_id  === category_id)  &&
        (pr.age_group_id === null || pr.age_group_id === age_group_id) &&
        (pr.season_id    === null || pr.season_id    === season_id)    &&
        (pr.gender_id    === null || pr.gender_id    === gender_id)
      )
      return hit ? { summary: discountLabel(hit), discount_type: hit.discount_type, value: hit.value } : null
    }

    // ── Helper: precio con promo aplicada ─────────────────────────────────
    function calcPromoPrice(price: number, promo: { discount_type: string; value: number }): number {
      if (promo.discount_type === 'percentage') {
        return Math.round(price * (1 - promo.value / 100))
      }
      return Math.max(0, Math.round(price - promo.value))
    }

    // ── Agrupar por producto ──────────────────────────────────────────────
    const productMap = new Map<number, {
      id:               number
      name:             string
      long_name:        string | null
      description:      string | null
      price:            number
      cuotas:           number
      category:         string | null
      age_group:        string | null
      has_image:        boolean
      /** URL principal de la imagen (proxied). Para CJ = general_image_url proxied. */
      image_url:        string | null
      /** Galería completa de imágenes CJ (proxied). [] para productos sin galería CJ. */
      gallery:          string[]
      /** PID de CJ — null para productos locales */
      cj_pid:           string | null
      /** Costo de envío CJ en USD (null = no calculado / no CJ). */
      cj_shipping_usd:  number | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      freight_options:  any[]
      today_promo:      string | null
      promo_price:      number | null
      variants: {
        id: number; sku: string; color: string; size: string
        specific_image_url: string | null; in_stock: boolean; stock_count: number
      }[]
    }>()

    for (const row of rows) {
      if (!productMap.has(row.product_id)) {
        const promo = matchPromo(row.category_id, row.age_group_id, row.season_id, row.gender_id)

        // Imagen principal: proxied CDN o null (foto local se sirve por otra ruta)
        const imageUrl = toProxyUrl(row.general_image_url)

        // Galería: productImages[] de CJ, todas proxied
        const gallery = row.cj_gallery
          ? toProxyUrls(row.cj_gallery)
          : (row.general_image_url ? [toProxyUrl(row.general_image_url)!] : [])

        productMap.set(row.product_id, {
          id:              row.product_id,
          name:            row.product_name,
          long_name:       row.long_name ?? null,
          description:     row.description,
          price:           row.price,
          cuotas:          row.cuotas,
          category:        row.category,
          age_group:       row.age_group,
          has_image:       row.has_image,
          image_url:       imageUrl,
          gallery,
          cj_pid:          row.cj_pid ?? null,
          cj_shipping_usd: row.cj_shipping_usd ?? null,
          freight_options: Array.isArray(row.cj_freight_options) ? row.cj_freight_options : [],
          today_promo:     promo?.summary ?? null,
          promo_price:     promo ? calcPromoPrice(row.price, promo) : null,
          variants:        [],
        })
      }
      productMap.get(row.product_id)!.variants.push({
        id:                 row.variant_id,
        sku:                row.sku,
        color:              row.color,
        size:               row.size,
        // Proxied: si la variante tiene imagen CDN de CJ, la envolvemos
        specific_image_url: toProxyUrl(row.specific_image_url),
        in_stock:           row.in_stock,
        stock_count:        row.stock_count,
      })
    }

    // ── Fotos adicionales por color ───────────────────────────────────────────
    const exportedIds = Array.from(productMap.keys())
    const colorImgMap = new Map<number, Record<string, number>>() // productId → { color: imgId }

    if (exportedIds.length > 0) {
      const { rows: colorImgRows } = await pool.query<{
        product_id: number; color: string | null; id: number
      }>(
        `SELECT product_id, color, id
         FROM product_images
         WHERE product_id = ANY($1::int[])
         ORDER BY sort_order, id`,
        [exportedIds]
      )
      for (const r of colorImgRows) {
        if (r.color === null) continue           // la foto general no va en el mapa de colores
        if (!colorImgMap.has(r.product_id)) colorImgMap.set(r.product_id, {})
        colorImgMap.get(r.product_id)![r.color] = r.id
      }
    }

    // Solo mostrar productos con al menos una variante en stock
    const products = Array.from(productMap.values())
      .filter(p => p.variants.some(v => v.in_stock))
      .map(p => ({ ...p, images_by_color: colorImgMap.get(p.id) ?? {} }))

    // ── Categorías únicas ─────────────────────────────────────────────────
    const categories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

    // ── Grupos de edad únicos (solo los que tienen productos en el catálogo) ─
    const age_groups = [...new Set(
      products.map(p => p.age_group).filter(Boolean) as string[]
    )].sort()

    return NextResponse.json({
      store: {
        name:             s.business_name           ?? null,
        logo:             s.business_logo           ?? null,
        address:          s.receipt_address         ?? null,
        phone:            s.receipt_phone           ?? null,
        whatsapp:         s.catalog_phone           ?? s.whatsapp_report_number ?? null,
        has_banner:       !!s.catalog_banner,
        html_banner:      s.catalog_html_banner     ?? null,
        banner_text:      s.catalog_banner_text     ?? null,
        shipping_info:    s.catalog_envio_info      ?? null,
        cuotas:           parseInt(s.catalog_cuotas ?? '0') || 0,
        footer_text:      s.catalog_footer_text     ?? null,
        info_items:       s.catalog_info_items      ?? null,
        currency:         s.currency               ?? 'ARS',
        locale:           s.locale                 ?? 'es-AR',
        /** 'paypal' | 'mercadopago' | 'manual' — detectado por settings configurados */
        payment_gateway:  paymentGateway,
      },
      categories,
      age_groups,
      products,
    })

  } catch (err) {
    console.error('[GET /api/catalog]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
