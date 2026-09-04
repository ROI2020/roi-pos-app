/**
 * POST /api/ml/sync
 *
 * Re-sincroniza el stock de todos los variantes de un producto hacia ML.
 * Se llama desde el botón "Publicado ML · ↺" en la card de producto.
 *
 * Body: { productId: number }
 */

import { NextResponse }              from 'next/server'
import pool                          from '@/lib/db'
import { requireBusinessId }         from '@/lib/get-business-id'
import { syncMLStockForVariants }    from '@/lib/ml-stock-sync'

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { productId } = await req.json() as { productId?: number }
  if (!productId) {
    return NextResponse.json({ error: 'productId requerido' }, { status: 400 })
  }

  // Obtener todas las variantes del producto (verificando ownership)
  const { rows } = await pool.query<{ id: number }>(
    `SELECT pv.id
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.product_id = $1
       AND p.business_id = $2`,
    [productId, businessId],
  )

  if (!rows.length) {
    return NextResponse.json(
      { error: 'Producto no encontrado o sin variantes' },
      { status: 404 },
    )
  }

  const variantIds = rows.map(r => r.id)
  await syncMLStockForVariants(businessId, variantIds)

  return NextResponse.json({ ok: true, synced: variantIds.length })
}
