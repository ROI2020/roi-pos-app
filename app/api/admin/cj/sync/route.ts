import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJProductStock } from '@/lib/cj'

/**
 * POST /api/admin/cj/sync
 *
 * Sincroniza precios y stock de todos los productos importados desde CJ.
 * Actualiza base_price en products y cj_last_sync.
 * El stock en nuestra app es gestionado por branch_inventory,
 * así que solo actualizamos el precio.
 *
 * Devuelve { updated: N, errors: [{pid, error}] }
 */
export async function POST() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  // Obtener todos los productos locales con cj_pid
  const { rows: products } = await pool.query<{
    id:     number
    cj_pid: string
  }>(
    `SELECT id, cj_pid
     FROM products
     WHERE business_id = $1
       AND cj_pid IS NOT NULL`,
    [businessId],
  )

  if (!products.length) {
    return NextResponse.json({ updated: 0, errors: [], message: 'No hay productos CJ para sincronizar' })
  }

  let token: string
  try {
    token = await getCJTokenForBusiness(businessId)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  let updated = 0
  const errors: { pid: string; error: string }[] = []

  for (const prod of products) {
    try {
      const stockMap = await getCJProductStock(token, prod.cj_pid)

      // Precio base = promedio de variantes (o el precio del primer vid)
      const prices = Array.from(stockMap.values()).map(s => s.price).filter(p => p > 0)
      const minPrice = prices.length ? Math.min(...prices) : null

      await pool.query(
        `UPDATE products
         SET base_price   = COALESCE($1, base_price),
             cj_last_sync = NOW()
         WHERE id = $2`,
        [minPrice, prod.id],
      )

      // Actualizar cj_last_sync en variantes (informativo)
      await pool.query(
        `UPDATE product_variants pv
         SET updated_at = NOW()
         FROM products p
         WHERE pv.product_id = p.id
           AND p.id = $1
           AND pv.cj_vid IS NOT NULL`,
        [prod.id],
      )

      updated++
    } catch (err) {
      console.error(`[CJ sync] Error en pid=${prod.cj_pid}:`, err)
      errors.push({ pid: prod.cj_pid, error: String(err) })
    }
  }

  // Log
  await pool.query(
    `INSERT INTO cj_sync_log (business_id, sync_type, status, detail)
     VALUES ($1, 'price_stock', $2, $3)`,
    [
      businessId,
      errors.length === 0 ? 'ok' : 'error',
      JSON.stringify({ total: products.length, updated, errors: errors.length }),
    ],
  )

  return NextResponse.json({ updated, errors, total: products.length })
}
