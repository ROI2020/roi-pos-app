import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/catalog
 *
 * Endpoint público — sin autenticación.
 * Devuelve los productos marcados con exportable_web = true,
 * con sus variantes agrupadas y disponibilidad de stock.
 *
 * También devuelve la info pública del negocio (nombre, logo, contacto).
 */
export async function GET() {
  try {
    // ── Info pública del negocio ──────────────────────────────────────────
    const { rows: settingRows } = await pool.query<{ key: string; value: string | null }>(
      `SELECT key, value FROM settings
       WHERE key IN (
         'business_name','business_logo',
         'receipt_address','receipt_phone','whatsapp_report_number',
         'catalog_banner','catalog_banner_text'
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
      has_image:          boolean
      variant_id:         number
      sku:                string
      color:              string
      size:               string
      specific_image_url: string | null
      in_stock:           boolean
    }>(
      `SELECT
         p.id                                                      AS product_id,
         p.name                                                    AS product_name,
         p.description,
         p.base_price::float                                       AS price,
         c.name                                                    AS category,
         (p.photo_url IS NOT NULL)                                 AS has_image,
         pv.id                                                     AS variant_id,
         pv.sku,
         pv.color,
         pv.size,
         pv.specific_image_url,
         (EXISTS (
           SELECT 1 FROM branch_inventory bi
           WHERE bi.product_variant_id = pv.id
         ))                                                        AS in_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN product_variants pv ON pv.product_id = p.id
       WHERE p.exportable_web = true
       ORDER BY p.id, pv.color, pv.size`
    )

    // ── Agrupar por producto ──────────────────────────────────────────────
    const productMap = new Map<number, {
      id: number; name: string; description: string | null
      price: number; category: string | null; has_image: boolean
      variants: { id: number; sku: string; color: string; size: string; specific_image_url: string | null; in_stock: boolean }[]
    }>()

    for (const row of rows) {
      if (!productMap.has(row.product_id)) {
        productMap.set(row.product_id, {
          id:          row.product_id,
          name:        row.product_name,
          description: row.description,
          price:       row.price,
          category:    row.category,
          has_image:   row.has_image,
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
      })
    }

    const products = Array.from(productMap.values())

    // ── Categorías únicas ─────────────────────────────────────────────────
    const categories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

    return NextResponse.json({
      store: {
        name:        s.business_name           ?? null,
        logo:        s.business_logo           ?? null,
        address:     s.receipt_address         ?? null,
        phone:       s.receipt_phone           ?? null,
        whatsapp:    s.whatsapp_report_number  ?? null,
        has_banner:  !!s.catalog_banner,
        banner_text: s.catalog_banner_text     ?? null,
      },
      categories,
      products,
    })

  } catch (err) {
    console.error('[GET /api/catalog]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
