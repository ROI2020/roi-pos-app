import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'

async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const { role } = JSON.parse(decodeURIComponent(raw)) as { role: string }
    if (role !== 'administrador' && role !== 'roisol_admin') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }
}

/**
 * DELETE /api/sales/:id
 *
 * Anula una venta (solo administrador):
 *   1. Restaura stock: re-inserta cada variante en branch_inventory
 *   2. Elimina movimientos de caja asociados (transactions type='sale')
 *   3. Elimina sale_details
 *   4. Elimina la venta
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await requireAdmin()
  if (blocked) return blocked

  const { id } = await params
  const saleId = parseInt(id, 10)
  if (isNaN(saleId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Obtener la venta y sus items
    const saleRes = await client.query<{ branch_id: number; arca_cae: string | null }>(
      `SELECT branch_id, arca_cae FROM sales WHERE id = $1`,
      [saleId]
    )
    if (!saleRes.rows.length) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }
    const { branch_id, arca_cae } = saleRes.rows[0]

    if (arca_cae) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Esta venta tiene factura electrónica emitida (CAE). No puede anularse desde el sistema.' },
        { status: 422 }
      )
    }

    const detailsRes = await client.query<{ product_variant_id: number }>(
      `SELECT product_variant_id FROM sale_details WHERE sale_id = $1`,
      [saleId]
    )

    // 1. Restaurar stock
    for (const { product_variant_id } of detailsRes.rows) {
      await client.query(
        `INSERT INTO branch_inventory (product_variant_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [product_variant_id, branch_id]
      )
    }

    // 2. Eliminar movimientos de caja
    await client.query(
      `DELETE FROM transactions WHERE type = 'sale' AND type_id = $1`,
      [saleId]
    )

    // 3. Eliminar detalle
    await client.query(`DELETE FROM sale_details WHERE sale_id = $1`, [saleId])

    // 4. Eliminar venta
    await client.query(`DELETE FROM sales WHERE id = $1`, [saleId])

    await client.query('COMMIT')

    return NextResponse.json({ ok: true, itemsRestored: detailsRes.rows.length })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[DELETE /api/sales/:id]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
