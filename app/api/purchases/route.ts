import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { parseTalles } from '@/lib/talles'

// ── Helper: slug del color para el SKU ──────────────────────────────────────
// "Negro"  → "NEG"
// "Rojo Oscuro" → "ROJ"
function colorSlug(color: string | null): string {
  return (color ?? 'SIN')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/[^A-Z0-9]/g, '')       // solo alfanumérico
    .slice(0, 3)
}

/**
 * POST /api/purchases
 *
 * Estructura resultante en BD:
 *
 *   purchases          1 fila (encabezado de factura)
 *     └── purchase_details   1 fila por combinación producto + color + curva
 *           └── product_variants   1 fila por prenda individual
 *
 * Ejemplo: Remera Básica, 2 curvas de 6-16,10,12 (8 talles por curva = 16 prendas)
 *   → 1 purchase_detail  (curva=2, quantity=16)
 *   → 16 product_variants, uno por prenda
 *      SKU: "1-NEG-06-000001", "1-NEG-08-000002", "1-NEG-10-000003", ...
 *           (productId - color3 - talleZeroPadded - idZeroPadded)
 *
 * Body:
 * {
 *   supplier_id: string,
 *   invoice_number: string,
 *   purchase_date: string,        // "YYYY-MM-DD"
 *   details: [{
 *     product_id: string,
 *     unit_cost: number,
 *     lines: [{
 *       color: string,
 *       curvas: number,           // cantidad de packs
 *       curva_sizes: string,      // ej: "4-16" | "0-5" | "6-16,10,12"
 *     }]
 *   }]
 * }
 */
export async function POST(request: Request) {
  const client = await pool.connect()

  try {
    const body = await request.json()
    const { supplier_id, invoice_number, purchase_date, title, details } = body

    // ── Validaciones ─────────────────────────────────────────────────────
    if (!supplier_id) {
      return NextResponse.json({ error: 'Falta el proveedor' }, { status: 400 })
    }
    if (!details?.length) {
      return NextResponse.json({ error: 'Sin detalle de mercadería' }, { status: 400 })
    }

    // ── Calcular total ────────────────────────────────────────────────────
    let totalAmount = 0
    for (const detail of details) {
      const cost = parseFloat(detail.unit_cost) || 0
      for (const line of detail.lines ?? []) {
        const talles = parseTalles(line.curva_sizes ?? '')
        const curvas = parseInt(line.curvas) || 0
        totalAmount += cost * curvas * talles.length
      }
    }

    // ── Transacción ───────────────────────────────────────────────────────
    await client.query('BEGIN')

    // 1. Encabezado de compra
    const { rows: [purchase] } = await client.query(
      `INSERT INTO purchases (supplier_id, total_amount, invoice_number, purchase_date, title)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        parseInt(supplier_id),
        totalAmount,
        invoice_number?.trim() || null,
        purchase_date || new Date().toISOString().split('T')[0],
        title?.trim() || null,
      ]
    )

    let totalVariants = 0

    // 2. Por cada producto
    for (const detail of details) {
      const cost    = parseFloat(detail.unit_cost) || 0
      const productId = detail.product_id ? parseInt(detail.product_id) : null

      // 3. Por cada línea color/curva del producto
      for (const line of detail.lines ?? []) {
        const talles = parseTalles(line.curva_sizes ?? '')
        const curvas = parseInt(line.curvas) || 0
        const quantity = curvas * talles.length

        if (quantity === 0) continue

        const color = line.color?.trim() || null

        // 3a. Una fila en purchase_details por combinación color+curva
        //     product_id apunta a products(id)  [FK corregida en migración]
        const { rows: [det] } = await client.query(
          `INSERT INTO purchase_details
             (purchase_id, product_id, unit_cost, color, curva, curva_sizes, quantity)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [purchase.id, productId, cost, color, curvas,
           line.curva_sizes?.trim() || null, quantity]
        )
        const detailId: number = det.id

        // 3b. Una fila en product_variants por cada prenda individual
        //
        // Si `curvas = 2` y talles = [6,8,10,10,12,12,14,16]  (curva "6-16,10,12")
        // → se insertan 2 × 8 = 16 registros
        //
        // parseTalles ya devuelve los refuerzos duplicados:
        //   "6-16,10,12" → [6,8,10,10,12,12,14,16]
        // Entonces iteramos talles × curvas para tener uno por prenda.

        if (productId) {
          const slug = colorSlug(color)

          for (const talle of talles) {
            const sizeStr = String(talle)

            for (let c = 0; c < curvas; c++) {
              // Insertar con SKU temporal para obtener el id autoincremental
              const { rows: [v] } = await client.query(
                `INSERT INTO product_variants
                   (product_id, color, size, purchase_detail_id, sku)
                 VALUES ($1, $2, $3, $4, 'TEMP')
                 RETURNING id`,
                [productId, color, sizeStr, detailId]
              )

              // SKU definitivo: {productId}-{COLOR3}-{talle02d}-{id06d}
              // Ej: "1-NEG-04-000023"
              const sku =
                `${productId}-${slug}-${sizeStr.padStart(2, '0')}-${String(v.id).padStart(6, '0')}`

              // barcode = sku (Code 128, listo para imprimir)
              await client.query(
                `UPDATE product_variants SET sku = $1, barcode = $1 WHERE id = $2`,
                [sku, v.id]
              )

              totalVariants++
            }
          }
        }
      }
    }

    await client.query('COMMIT')

    return NextResponse.json(
      {
        id: purchase.id,
        total_amount: totalAmount,
        variants_created: totalVariants,
        message: `Compra #${purchase.id} grabada — ${totalVariants} prendas registradas`,
      },
      { status: 201 }
    )

  } catch (err: unknown) {
    await client.query('ROLLBACK')
    console.error('[POST /api/purchases]', err)
    return NextResponse.json(
      { error: 'Error al grabar la compra', detail: String(err) },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
