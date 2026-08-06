import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { insertSaleTransactions } from '@/lib/transactions'

/**
 * POST /api/sales
 *
 * Procesa una venta completa en una transacción atómica:
 *   1. INSERT en `sales`
 *   2. Por cada prenda:
 *      a. Verifica que la variante esté en branch_inventory de la sucursal indicada
 *      b. INSERT en `sale_details`
 *      c. DELETE de branch_inventory (el artículo sale del inventario físico)
 *
 * Body:
 * {
 *   branch_id:       number,
 *   pos_session_id?: number,
 *   invoice_number?: string,
 *   discount_amount: number,   // monto ya calculado
 *   payment_method:  string,
 *   notes?:          string,
 *   items: [{ variant_id: number, unit_price: number }]
 * }
 */
export async function POST(req: Request) {
  const client = await pool.connect()
  try {
    const {
      branch_id, pos_session_id, invoice_number,
      discount_amount, payment_method, payment_split, notes, items, user_id,
      customer_id, discount_code_id,
    } = await req.json()

    // ── Validaciones básicas ─────────────────────────────────────────────
    if (!branch_id)
      return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })
    if (!items?.length)
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
    if (!payment_method)
      return NextResponse.json({ error: 'Forma de pago requerida' }, { status: 400 })

    const discount = parseFloat(discount_amount) || 0
    const subtotal = (items as { variant_id: number; unit_price: number }[])
      .reduce((sum, i) => sum + i.unit_price, 0)
    const total    = Math.max(0, subtotal - discount)

    await client.query('BEGIN')

    // ── 1. Encabezado de venta ────────────────────────────────────────────
    // payment_split es un objeto { efectivo: 2000, mp: 3000 } — solo cuando pago mixto
    const splitJson = payment_split && Object.keys(payment_split).length > 1
      ? JSON.stringify(payment_split)
      : null

    const { rows: [sale] } = await client.query(
      `INSERT INTO sales
         (branch_id, pos_session_id, invoice_number,
          subtotal, discount_amount, total_amount,
          payment_method, payment_split, notes, user_id, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, business_id`,
      [
        branch_id,
        pos_session_id ?? null,
        invoice_number?.trim() || null,
        subtotal, discount, total,
        payment_method,
        splitJson,
        notes?.trim() || null,
        user_id ?? null,
        customer_id ?? null,
      ]
    )

    // ── 2. Por cada prenda ────────────────────────────────────────────────
    for (const item of items as { variant_id: number; unit_price: number }[]) {
      // a. Verificar stock en sucursal
      const stock = await client.query(
        `SELECT id FROM branch_inventory
          WHERE product_variant_id = $1 AND branch_id = $2`,
        [item.variant_id, branch_id]
      )
      if (stock.rows.length === 0) {
        await client.query('ROLLBACK')
        // Obtener info de la variante para mensaje de error útil
        const vInfo = await pool.query(
          `SELECT pv.sku, p.name FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE pv.id=$1`,
          [item.variant_id]
        )
        const name = vInfo.rows[0]?.name ?? `variante #${item.variant_id}`
        return NextResponse.json(
          { error: `"${name}" ya no está disponible en esta sucursal. Actualizá el carrito.` },
          { status: 409 }
        )
      }

      // b. INSERT en sale_details  (UNIQUE constraint atrapa doble-venta)
      await client.query(
        `INSERT INTO sale_details (sale_id, product_variant_id, unit_price)
         VALUES ($1, $2, $3)`,
        [sale.id, item.variant_id, item.unit_price]
      )

      // c. Remover de branch_inventory → el artículo sale del stock físico
      await client.query(
        `DELETE FROM branch_inventory
          WHERE product_variant_id = $1 AND branch_id = $2`,
        [item.variant_id, branch_id]
      )
    }

    // ── 2b. Marcar código de descuento como usado ─────────────────────────────
    if (discount_code_id) {
      await client.query(
        `UPDATE discount_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
        [discount_code_id]
      )
    }

    // ── 3. Registrar movimiento(s) de caja ──────────────────────────────────
    await insertSaleTransactions(client, {
      businessId: sale.business_id,
      branchId:   branch_id,
      saleId:     sale.id,
      amountByMethod: splitJson
        ? (payment_split as Record<string, number>)
        : { [payment_method]: total },
    })

    await client.query('COMMIT')

    return NextResponse.json(
      {
        id:            sale.id,
        subtotal,
        discount_amount: discount,
        total_amount:  total,
        items_sold:    items.length,
        message:       `Venta #${sale.id} registrada — ${items.length} prenda${items.length !== 1 ? 's' : ''}`,
      },
      { status: 201 }
    )

  } catch (err: unknown) {
    await client.query('ROLLBACK')
    // Constraint de prenda ya vendida
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'Una o más prendas del carrito ya fueron vendidas. Actualizá el carrito.' },
        { status: 409 }
      )
    }
    console.error('[POST /api/sales]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
