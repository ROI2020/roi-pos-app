import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const productId = parseInt(id)

  try { const { rows } = await pool.query(`
    -- Creación del producto
    SELECT
      'creacion'::text AS type,
      p.created_at      AS date,
      p.name            AS description,
      p.base_price::float AS amount,
      '{}'::json        AS extra
    FROM products p
    WHERE p.id = $1

    UNION ALL

    -- Compras (una fila por purchase_detail / lote de color+talles)
    SELECT
      'compra'::text AS type,
      pu.purchase_date AS date,
      CONCAT(
        pd.color,
        CASE WHEN pd.curva_sizes IS NOT NULL AND pd.curva_sizes != ''
             THEN ' · Talles: ' || pd.curva_sizes ELSE '' END
      ) AS description,
      pd.unit_cost::float AS amount,
      json_build_object(
        'quantity',    pd.quantity,
        'title',       pu.title,
        'invoice',     pu.invoice_number,
        'supplier',    sup.company_name,
        'purchase_id', pu.id
      ) AS extra
    FROM purchase_details pd
    JOIN purchases pu       ON pu.id  = pd.purchase_id
    LEFT JOIN suppliers sup ON sup.id = pu.supplier_id
    WHERE pd.product_id = $1

    UNION ALL

    -- Ventas (una fila por variante vendida)
    SELECT
      'venta'::text AS type,
      s.sold_at     AS date,
      CONCAT(pv.color, ' T.', pv.size) AS description,
      sd.unit_price::float AS amount,
      json_build_object(
        'sale_id',  s.id,
        'discount', s.discount_amount::float,
        'total',    s.total_amount::float,
        'branch',   br.name,
        'user',     au.name
      ) AS extra
    FROM product_variants pv
    JOIN sale_details sd     ON sd.product_variant_id = pv.id
    JOIN sales s             ON s.id  = sd.sale_id
    JOIN branches br         ON br.id = s.branch_id
    LEFT JOIN app_users au   ON au.id = s.user_id
    WHERE pv.product_id = $1

    UNION ALL

    -- Cambios: este producto fue DEVUELTO
    SELECT
      'cambio_devuelto'::text AS type,
      ex.created_at           AS date,
      CONCAT(pv.color, ' T.', pv.size) AS description,
      ex.returned_price::float AS amount,
      json_build_object(
        'exchange_id', ex.id,
        'new_variant', CONCAT(pv2.color, ' T.', pv2.size),
        'difference',  ex.difference_amount::float,
        'branch',      br.name,
        'user',        au.name
      ) AS extra
    FROM product_variants pv
    JOIN exchanges ex           ON ex.returned_variant_id = pv.id
    JOIN product_variants pv2  ON pv2.id = ex.new_variant_id
    JOIN branches br            ON br.id  = ex.branch_id
    LEFT JOIN app_users au      ON au.id  = ex.user_id
    WHERE pv.product_id = $1

    UNION ALL

    -- Cambios: este producto fue ENTREGADO como reemplazo
    SELECT
      'cambio_recibido'::text AS type,
      ex.created_at           AS date,
      CONCAT(pv2.color, ' T.', pv2.size) AS description,
      ex.new_price::float AS amount,
      json_build_object(
        'exchange_id',      ex.id,
        'returned_variant', CONCAT(pv.color, ' T.', pv.size),
        'difference',       ex.difference_amount::float,
        'branch',           br.name,
        'user',             au.name
      ) AS extra
    FROM product_variants pv2
    JOIN exchanges ex           ON ex.new_variant_id = pv2.id
    JOIN product_variants pv   ON pv.id  = ex.returned_variant_id
    JOIN branches br            ON br.id  = ex.branch_id
    LEFT JOIN app_users au      ON au.id  = ex.user_id
    WHERE pv2.product_id = $1

    ORDER BY date ASC
  `, [productId])
  return NextResponse.json(rows)
  } catch (err) {
    console.error('[GET /api/products/[id]/history]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
