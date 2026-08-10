import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/catalog
 *
 * Endpoint público — sin autenticación.
 * Devuelve los productos marcados con exportable_web = true,
 * con sus variantes agrupadas y disponibilidad de stock.
 *
 * También devuelve:
 *  - info pública del negocio (nombre, logo, contacto)
 *  - age_groups únicos que tienen productos en el catálogo (para filtro en Tienda)
 *  - today_promo por producto: promo vigente HOY (no roulette_only) que aplica al producto
 */
export async function GET() {
  try {
    // ── Info pública del negocio ──────────────────────────────────────────
    const { rows: settingRows } = await pool.query<{ key: string; value: string | null }>(
      `SELECT key, value FROM settings
       WHERE key IN (
         'business_name','business_logo',
         'receipt_address','receipt_phone','whatsapp_report_number',
         'catalog_banner','catalog_banner_text','catalog_envio_info',
         'catalog_phone'
       )`
    )
    const s = Object.fromEntries(settingRows.map(r => [r.key, r.value]))

    // ── Variantes con stock ───────────────────────────────────────────────
    const { rows } = await pool.query<{
      product_id:         number
      product_name:       string
      description:        string | null
      price:              number
      category:           string | null
      category_id:        number | null
      age_group_id:       number | null
      age_group:          string | null
      season_id:          number | null
      gender_id:          number | null
      has_image:          boolean
      variant_id:         number
      sku:                string
      color:              string
      size:               string
      specific_image_url: string | null
      in_stock:           boolean
      stock_count:        number
    }>(
      `SELECT
         p.id                                                      AS product_id,
         p.name                                                    AS product_name,
         p.description,
         p.base_price::float                                       AS price,
         c.name                                                    AS category,
         p.category_id,
         p.age_group_id,
         ag.name                                                   AS age_group,
         p.season_id,
         p.gender_id,
         (p.photo_url IS NOT NULL)                                 AS has_image,
         pv.id                                                     AS variant_id,
         pv.sku,
         pv.color,
         pv.size,
         pv.specific_image_url,
         (EXISTS (
           SELECT 1 FROM branch_inventory bi
           WHERE bi.product_variant_id = pv.id
         ))                                                        AS in_stock,
         COALESCE((
           SELECT COUNT(bi.id)::int
           FROM branch_inventory bi
           WHERE bi.product_variant_id = pv.id
         ), 0)                                                     AS stock_count
       FROM products p
       LEFT JOIN categories c  ON c.id  = p.category_id
       LEFT JOIN age_groups  ag ON ag.id = p.age_group_id
       JOIN product_variants pv ON pv.product_id = p.id
       WHERE p.exportable_web = true
       ORDER BY p.id, pv.color, pv.size`
    )

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
       WHERE active = true
         AND roulette_only = false
         AND (start_date IS NULL OR start_date <= CURRENT_DATE)
         AND (end_date   IS NULL OR end_date   >= CURRENT_DATE)
         AND days_of_week LIKE $1`,
      [`%${dayDigit}%`]
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
    ): string | null {
      const hit = promoRows.find(pr =>
        (pr.category_id  === null || pr.category_id  === category_id)  &&
        (pr.age_group_id === null || pr.age_group_id === age_group_id) &&
        (pr.season_id    === null || pr.season_id    === season_id)    &&
        (pr.gender_id    === null || pr.gender_id    === gender_id)
      )
      return hit ? discountLabel(hit) : null
    }

    // ── Agrupar por producto ──────────────────────────────────────────────
    const productMap = new Map<number, {
      id:          number
      name:        string
      description: string | null
      price:       number
      category:    string | null
      age_group:   string | null
      has_image:   boolean
      today_promo: string | null
      variants: {
        id: number; sku: string; color: string; size: string
        specific_image_url: string | null; in_stock: boolean; stock_count: number
      }[]
    }>()

    for (const row of rows) {
      if (!productMap.has(row.product_id)) {
        productMap.set(row.product_id, {
          id:          row.product_id,
          name:        row.product_name,
          description: row.description,
          price:       row.price,
          category:    row.category,
          age_group:   row.age_group,
          has_image:   row.has_image,
          today_promo: matchPromo(row.category_id, row.age_group_id, row.season_id, row.gender_id),
          variants:    [],
        })
      }
      productMap.get(row.product_id)!.variants.push({
        id:                 row.variant_id,
        sku:                row.sku,
        color:              row.color,
        size:               row.size,
        specific_image_url: row.specific_image_url,
        in_stock:           row.in_stock,
        stock_count:        row.stock_count,
      })
    }

    const products = Array.from(productMap.values())

    // ── Categorías únicas ─────────────────────────────────────────────────
    const categories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

    // ── Grupos de edad únicos (solo los que tienen productos en el catálogo) ─
    const age_groups = [...new Set(
      products.map(p => p.age_group).filter(Boolean) as string[]
    )].sort()

    return NextResponse.json({
      store: {
        name:          s.business_name           ?? null,
        logo:          s.business_logo           ?? null,
        address:       s.receipt_address         ?? null,
        phone:         s.receipt_phone           ?? null,
        whatsapp:      s.catalog_phone            ?? s.whatsapp_report_number ?? null,
        has_banner:    !!s.catalog_banner,
        banner_text:   s.catalog_banner_text     ?? null,
        shipping_info: s.catalog_envio_info      ?? null,
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
