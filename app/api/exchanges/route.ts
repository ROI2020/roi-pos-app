import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getFopId, insertTransaction } from '@/lib/transactions'

/**
 * POST /api/exchanges
 *
 * Body: {
 *   branch_id, pos_session_id?, user_id?,
 *   returned_variant_id,   ← artículo que trae el cliente
 *   new_variant_id,        ← artículo que se lleva el cliente
 *   new_price,             ← precio acordado para el artículo nuevo
 *   payment_method?,       ← requerido si hay diferencia de importe
 *   notes?
 * }
 *
 * Transacción:
 *   1. Verifica que returned_variant está en sale_details (fue vendido)
 *   2. Verifica que new_variant está en branch_inventory de la sucursal
 *   3. Elimina sale_details del artículo devuelto
 *   4. Restaura el artículo devuelto a branch_inventory
 *   5. Elimina el artículo nuevo de branch_inventory
 *   6. Crea un registro en sales (diferencia de importe)
 *   7. Crea sale_detail para el artículo nuevo
 *   8. Registra en exchanges
 */
export async function POST(req: Request) {
  const {
    branch_id, pos_session_id, user_id,
    returned_variant_id, new_variant_id,
    new_price, payment_method, notes,
  } = await req.json()

  if (!branch_id)
    return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })
  if (!returned_variant_id)
    return NextResponse.json({ error: 'returned_variant_id requerido' }, { status: 400 })
  if (!new_variant_id)
    return NextResponse.json({ error: 'new_variant_id requerido' }, { status: 400 })
  if (returned_variant_id === new_variant_id)
    return NextResponse.json({ error: 'El artículo nuevo debe ser distinto al devuelto' }, { status: 400 })

  const newPriceNum = parseFloat(new_price)
  if (isNaN(newPriceNum) || newPriceNum < 0)
    return NextResponse.json({ error: 'new_price inválido' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Verificar que el artículo devuelto figura en sale_details.
    //    Precio devuelto = lo que pagó realmente el cliente, con descuento proporcional:
    //    effective_price = unit_price × (total_amount / subtotal)
    const { rows: sdRows } = await client.query(
      `SELECT
         sd.id,
         sd.unit_price::float,
         sd.sale_id,
         CASE
           WHEN s.subtotal > 0
           THEN ROUND((sd.unit_price * s.total_amount / s.subtotal)::numeric, 2)::float
           ELSE sd.unit_price::float
         END AS effective_price
       FROM sale_details sd
       JOIN sales s ON s.id = sd.sale_id
       WHERE sd.product_variant_id = $1`,
      [returned_variant_id]
    )
    if (sdRows.length === 0)
      throw new Error('El artículo devuelto no figura como vendido en el sistema')

    const returned_price = sdRows[0].effective_price as number
    const difference_amount = newPriceNum - returned_price

    // 2. Verificar que el artículo nuevo está en stock en la sucursal
    const { rows: biRows } = await client.query(
      `SELECT id FROM branch_inventory
       WHERE product_variant_id = $1 AND branch_id = $2`,
      [new_variant_id, parseInt(branch_id)]
    )
    if (biRows.length === 0)
      throw new Error('El artículo de reemplazo no está en stock en esta sucursal')

    // 3. Quitar el artículo devuelto de sale_details
    await client.query(
      `DELETE FROM sale_details WHERE product_variant_id = $1`,
      [returned_variant_id]
    )

    // 4. Volver a poner el artículo devuelto en branch_inventory
    await client.query(
      `INSERT INTO branch_inventory (product_variant_id, branch_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [returned_variant_id, parseInt(branch_id)]
    )

    // 5. Quitar el artículo nuevo de branch_inventory
    await client.query(
      `DELETE FROM branch_inventory
       WHERE product_variant_id = $1 AND branch_id = $2`,
      [new_variant_id, parseInt(branch_id)]
    )

    // 6. Crear un registro en sales para la diferencia
    //    total_amount puede ser negativo (devolución de dinero)
    const { rows: saleRows } = await client.query(
      `INSERT INTO sales
         (branch_id, pos_session_id, subtotal, discount_amount, total_amount,
          payment_method, notes, sold_at)
       VALUES ($1, $2, $3, 0, $4, $5, $6, NOW())
       RETURNING id, business_id`,
      [
        parseInt(branch_id),
        pos_session_id ?? null,
        Math.abs(difference_amount),           // subtotal = importe en juego
        difference_amount,                     // total = diferencia (puede ser negativa)
        payment_method ?? 'cambio',
        notes?.trim() || 'Cambio de mercadería',
      ]
    )
    const exchangeSaleId = saleRows[0].id as number
    const businessId     = saleRows[0].business_id as number

    // 7. sale_detail para el artículo nuevo (queda registrado como vendido)
    await client.query(
      `INSERT INTO sale_details (sale_id, product_variant_id, unit_price)
       VALUES ($1, $2, $3)`,
      [exchangeSaleId, new_variant_id, newPriceNum]
    )

    // 8. Registrar en exchanges
    const { rows: exRows } = await client.query(
      `INSERT INTO exchanges
         (exchange_sale_id, branch_id, pos_session_id, user_id,
          returned_variant_id, new_variant_id,
          returned_price, new_price, difference_amount,
          payment_method, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        exchangeSaleId,
        parseInt(branch_id),
        pos_session_id  ?? null,
        user_id         ?? null,
        returned_variant_id,
        new_variant_id,
        returned_price,
        newPriceNum,
        difference_amount,
        payment_method  ?? null,
        notes?.trim()   || null,
      ]
    )

    // 9. Registrar movimiento de caja por la diferencia (si hubo pago real)
    if (payment_method && difference_amount !== 0) {
      const fopId = await getFopId(client, parseInt(branch_id), payment_method)
      if (fopId) {
        await insertTransaction(client, {
          businessId: businessId,
          branchId:   parseInt(branch_id),
          fopId,
          type:       'exchange',
          typeId:     exRows[0].id,
          amount:     difference_amount,
        })
      }
    }

    await client.query('COMMIT')
    return NextResponse.json(
      { ok: true, exchange_id: exRows[0].id, exchange_sale_id: exchangeSaleId },
      { status: 201 }
    )
  } catch (err: unknown) {
    await client.query('ROLLBACK')
    const msg = (err as Error).message
    console.error('[POST /api/exchanges]', err)
    return NextResponse.json({ error: msg }, { status: 400 })
  } finally {
    client.release()
  }
}
