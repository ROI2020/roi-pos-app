import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/reports/online-orders-sold?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve una fila por producto con sus métricas de pedidos online en el período.
 * Solo aparecen productos con al menos 1 pedido en estado activo
 * (approved / confirmed / preparing / delivered).
 *
 * Incluye tanto productos CJ (dropshipping) como físicos vendidos online.
 * No incluye costo/margen porque los productos CJ no tienen purchase_details.
 *
 * Columnas retornadas:
 *   category     — nombre de categoría (o 'Sin categoría')
 *   gender       — nombre de género (o 'Sin género')
 *   product_id   — id del producto
 *   product_name — nombre del producto
 *   is_cj        — true si el producto es dropshipping CJ
 *   qty_sold     — unidades vendidas en el período
 *   revenue      — suma de unit_price de los ítems
 */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to requeridos' }, { status: 400 })

  const { rows } = await pool.query(`
    SELECT
      COALESCE(c.name, 'Sin categoría')       AS category,
      COALESCE(g.name, 'Sin género')           AS gender,
      p.id                                     AS product_id,
      p.name                                   AS product_name,
      (p.cj_pid IS NOT NULL)                   AS is_cj,

      COUNT(oi.id)::int                        AS qty_sold,
      COALESCE(SUM(oi.unit_price), 0)::float   AS revenue

    FROM online_order_items oi
    JOIN  online_orders oo    ON oo.id  = oi.online_order_id
    JOIN  product_variants pv ON pv.id  = oi.product_variant_id
    JOIN  products p          ON p.id   = pv.product_id
    LEFT JOIN categories c    ON c.id   = p.category_id
    LEFT JOIN genders    g    ON g.id   = p.gender_id

    WHERE oo.business_id = $3
      AND oo.status IN ('approved', 'confirmed', 'preparing', 'delivered')
      AND (oo.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          BETWEEN $1::date AND $2::date

    GROUP BY c.name, g.name, p.id, p.name, p.cj_pid
    ORDER BY SUM(oi.unit_price) DESC NULLS LAST
  `, [from, to, businessId])

  return NextResponse.json(rows)
}
