import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// ── Types ──────────────────────────────────────────────────────────────────────

interface VariantSpec {
  size: string
  color: string
  stock: number
  sku_hint: string | null
}

interface ProductGroup {
  base_name: string
  category_name: string | null
  description: string | null
  base_price: number
  unit_cost: number
  variants: VariantSpec[]
}

interface ImportRequest {
  groups:    ProductGroup[]
  branch_id: number
}

// ── Helper: slug de 3 letras del color (igual que en /api/purchases) ──────────
function colorSlug(color: string): string {
  return color.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const client = await pool.connect()
  try {
    const { groups, branch_id }: ImportRequest = await req.json()

    if (!groups?.length)  return NextResponse.json({ error: 'Sin datos para importar' }, { status: 400 })
    if (!branch_id)       return NextResponse.json({ error: 'branch_id requerido' },     { status: 400 })

    await client.query('BEGIN')

    // ── 1. Proveedor "Migración" ──────────────────────────────────────────────
    let supplierId: number
    const { rows: existSup } = await client.query(
      `SELECT id FROM suppliers WHERE LOWER(company_name) IN ('migración','migracion') LIMIT 1`
    )
    if (existSup.length > 0) {
      supplierId = existSup[0].id
    } else {
      const { rows: [sup] } = await client.query(
        `INSERT INTO suppliers (company_name) VALUES ('Migración') RETURNING id`
      )
      supplierId = sup.id
    }

    // ── 2. Compra "Migración de Productos" ────────────────────────────────────
    const { rows: [purchase] } = await client.query(
      `INSERT INTO purchases (supplier_id, total_amount, invoice_number, title)
       VALUES ($1, 0, 'MIGRACION', 'Migración de Productos') RETURNING id`,
      [supplierId]
    )
    const purchaseId: number = purchase.id

    // ── 3. Caché de categorías ────────────────────────────────────────────────
    const catCache = new Map<string, number>()

    const getCatId = async (name: string): Promise<number> => {
      const key = name.toLowerCase().trim()
      if (catCache.has(key)) return catCache.get(key)!
      const { rows: [cat] } = await client.query(
        `INSERT INTO categories (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name.trim()]
      )
      catCache.set(key, cat.id)
      return cat.id
    }

    // ── 4. Procesar grupos ────────────────────────────────────────────────────
    let totalVariants  = 0
    let totalInventory = 0
    let totalAmount    = 0
    const errors: string[] = []

    for (const group of groups) {
      try {
        // 4a. Categoría
        const categoryId = group.category_name ? await getCatId(group.category_name) : null

        // 4b. Producto
        const { rows: [product] } = await client.query(
          `INSERT INTO products (name, category_id, description, base_price)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [group.base_name, categoryId, group.description ?? null, group.base_price]
        )
        const productId: number = product.id

        // 4c. purchase_detail — 1 por grupo
        const { rows: [detail] } = await client.query(
          `INSERT INTO purchase_details
             (purchase_id, product_id, unit_cost, color, curva, curva_sizes, quantity)
           VALUES ($1, $2, $3, $4, 1, 'X', $5) RETURNING id`,
          [purchaseId, productId, group.unit_cost, 'Varios', group.variants.length]
        )
        const detailId: number = detail.id

        totalAmount += group.unit_cost * group.variants.length

        // 4d. Variantes
        const slug = colorSlug(group.variants[0]?.color ?? 'Varios')

        for (const variant of group.variants) {
          // INSERT con SKU temporal para obtener el id autoincremental
          const { rows: [v] } = await client.query(
            `INSERT INTO product_variants
               (product_id, color, size, purchase_detail_id, sku)
             VALUES ($1, $2, $3, $4, 'TEMP') RETURNING id`,
            [productId, variant.color, variant.size, detailId]
          )

          // SKU definitivo: {productId}-{COLOR3}-{talle}-{id06d}
          const sku = `${productId}-${slug}-${variant.size}-${String(v.id).padStart(6, '0')}`
          await client.query(
            `UPDATE product_variants SET sku = $1, barcode = $1 WHERE id = $2`,
            [sku, v.id]
          )
          totalVariants++

          // 4e. Inventario
          if (variant.stock > 0) {
            await client.query(
              `INSERT INTO branch_inventory (product_variant_id, branch_id)
               VALUES ($1, $2) ON CONFLICT (product_variant_id, branch_id) DO NOTHING`,
              [v.id, branch_id]
            )
            totalInventory++
          }
        }
      } catch (err) {
        errors.push(`"${group.base_name}": ${String(err)}`)
      }
    }

    // ── 5. Actualizar total de la compra ──────────────────────────────────────
    await client.query(
      `UPDATE purchases SET total_amount = $1 WHERE id = $2`,
      [totalAmount, purchaseId]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      purchase_id:        purchaseId,
      products_created:   groups.length - errors.length,
      variants_created:   totalVariants,
      inventory_created:  totalInventory,
      categories_created: catCache.size,
      total_amount:       totalAmount,
      errors,
      message: errors.length === 0
        ? `Importación exitosa: ${groups.length} productos, ${totalVariants} variantes, ${totalInventory} prendas en inventario`
        : `Importación con ${errors.length} error(es). Ver detalles.`,
    })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/migrate/import]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
