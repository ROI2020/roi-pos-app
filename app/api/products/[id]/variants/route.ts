import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/products/[id]/variants
 *
 * Variantes de un producto con su estado de stock y sucursal asignada.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { rows } = await pool.query(
    `SELECT
       pv.id,
       pv.sku,
       pv.color,
       pv.size,
       pd.unit_cost::float         AS unit_cost,
       b.name                      AS branch_name,
       CASE
         WHEN sd.id IS NOT NULL THEN 'vendido'
         WHEN bi.id IS NOT NULL THEN 'en_stock'
         ELSE 'sin_asignar'
       END                         AS status,
       sal.sold_at
     FROM product_variants pv
     LEFT JOIN purchase_details  pd  ON pd.id  = pv.purchase_detail_id
     LEFT JOIN branch_inventory  bi  ON bi.product_variant_id = pv.id
     LEFT JOIN branches          b   ON b.id   = bi.branch_id
     LEFT JOIN sale_details      sd  ON sd.product_variant_id = pv.id
     LEFT JOIN sales             sal ON sal.id  = sd.sale_id
     WHERE pv.product_id = $1
     ORDER BY
       pv.color,
       CASE WHEN pv.size ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN pv.size::numeric ELSE NULL END NULLS LAST,
       pv.size`,
    [id]
  )

  return NextResponse.json(rows)
}
