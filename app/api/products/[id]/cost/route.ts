import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * PATCH /api/products/[id]/cost
 * Body: { unit_cost: number }
 *
 * Actualiza el unit_cost de todos los purchase_details con costo=0
 * que estén vinculados a variantes de este producto.
 * También recalcula el total_amount de las compras afectadas.
 *
 * Útil para corregir productos importados sin costo registrado.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { id }        = await params
  const productId     = parseInt(id)
  const { unit_cost } = await req.json() as { unit_cost: number }

  if (typeof unit_cost !== 'number' || unit_cost <= 0)
    return NextResponse.json({ error: 'unit_cost debe ser mayor que 0' }, { status: 400 })

  // Verificar que el producto pertenece al negocio
  const { rows: prod } = await pool.query(
    `SELECT id FROM products WHERE id = $1 AND business_id = $2`,
    [productId, businessId]
  )
  if (prod.length === 0)
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Encontrar purchase_details con costo=0 vinculados a variantes del producto
    const { rows: affected } = await client.query(`
      SELECT DISTINCT pd.id AS detail_id, pd.purchase_id
      FROM purchase_details pd
      WHERE pd.unit_cost = 0
        AND pd.id IN (
          SELECT pv.purchase_detail_id
          FROM product_variants pv
          WHERE pv.product_id = $1
            AND pv.purchase_detail_id IS NOT NULL
        )
    `, [productId])

    if (affected.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ updated: 0, message: 'No hay purchase_details con costo $0 para este producto' })
    }

    const detailIds  = affected.map((r: { detail_id: number }) => r.detail_id)
    const purchaseIds = [...new Set(affected.map((r: { purchase_id: number }) => r.purchase_id))]

    // 2. Actualizar unit_cost
    await client.query(`
      UPDATE purchase_details
      SET unit_cost = $1
      WHERE id = ANY($2::int[])
    `, [unit_cost, detailIds])

    // 3. Recalcular total_amount en cada compra afectada
    for (const purchaseId of purchaseIds) {
      await client.query(`
        UPDATE purchases
        SET total_amount = (
          SELECT COALESCE(SUM(d.unit_cost * d.quantity), 0)
          FROM purchase_details d
          WHERE d.purchase_id = $1
        )
        WHERE id = $1
      `, [purchaseId])
    }

    await client.query('COMMIT')
    return NextResponse.json({
      updated:     affected.length,
      purchasesAffected: purchaseIds.length,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /api/products/:id/cost]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
