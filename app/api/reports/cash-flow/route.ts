import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/reports/cash-flow?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve todos los movimientos de caja en el rango dado:
 *   - Ventas (sales, excluye cambios que tienen su propio tipo)
 *   - Cambios (exchanges — solo la diferencia de precio)
 *   - Gastos  (daily_expenses — montos negativos)
 *
 * Cada fila incluye los importes desagregados por forma de pago
 * para poder armar totales por columna en el frontend.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to son requeridos (YYYY-MM-DD)' }, { status: 400 })

  const { rows } = await pool.query(`
    -- ── Ventas normales (excluye los registros que son diferencias de cambios) ──
    SELECT
      'venta'                            AS type,
      s.id::text                         AS source_id,
      s.sold_at                          AS datetime,
      CASE
        WHEN s.invoice_number IS NOT NULL AND s.invoice_number != ''
          THEN s.invoice_number
        ELSE CONCAT(cnt.n, ' prenda', CASE WHEN cnt.n != 1 THEN 's' ELSE '' END)
      END                                AS description,
      s.notes,
      br.name                            AS branch_name,
      s.branch_id,
      s.payment_method,
      COALESCE(uv.name, '')              AS user_name,
      s.total_amount::float              AS total,
      -- Si la venta tiene split, usar el monto por método del JSON; si no, lógica original
      CASE WHEN s.payment_split IS NULL
        THEN CASE WHEN s.payment_method='efectivo'      THEN s.total_amount::float ELSE 0 END
        ELSE COALESCE((s.payment_split->>'efectivo')::float,      0) END AS efectivo,
      CASE WHEN s.payment_split IS NULL
        THEN CASE WHEN s.payment_method='debito'        THEN s.total_amount::float ELSE 0 END
        ELSE COALESCE((s.payment_split->>'debito')::float,        0) END AS debito,
      CASE WHEN s.payment_split IS NULL
        THEN CASE WHEN s.payment_method='credito'       THEN s.total_amount::float ELSE 0 END
        ELSE COALESCE((s.payment_split->>'credito')::float,       0) END AS credito,
      CASE WHEN s.payment_split IS NULL
        THEN CASE WHEN s.payment_method='mp'            THEN s.total_amount::float ELSE 0 END
        ELSE COALESCE((s.payment_split->>'mp')::float,            0) END AS mp,
      CASE WHEN s.payment_split IS NULL
        THEN CASE WHEN s.payment_method='transferencia' THEN s.total_amount::float ELSE 0 END
        ELSE COALESCE((s.payment_split->>'transferencia')::float, 0) END AS transferencia
    FROM sales s
    JOIN branches br ON br.id = s.branch_id
    LEFT JOIN app_users uv ON uv.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n FROM sale_details WHERE sale_id = s.id
    ) cnt ON true
    WHERE s.sold_at::date BETWEEN $1::date AND $2::date
      AND NOT EXISTS (SELECT 1 FROM exchanges ex WHERE ex.exchange_sale_id = s.id)

    UNION ALL

    -- ── Cambios: solo aparece si hubo diferencia de precio ────────────────
    SELECT
      'cambio'                           AS type,
      s.id::text                         AS source_id,
      s.sold_at                          AS datetime,
      CONCAT(
        COALESCE(rp.name,'?'), ' T.', COALESCE(rv.size,'?'),
        ' → ',
        COALESCE(np.name,'?'), ' T.', COALESCE(nv.size,'?')
      )                                  AS description,
      s.notes,
      br.name                            AS branch_name,
      s.branch_id,
      COALESCE(s.payment_method,'cambio') AS payment_method,
      COALESCE(uc.name, '')              AS user_name,
      s.total_amount::float              AS total,
      CASE WHEN s.payment_method='efectivo'      THEN  s.total_amount::float ELSE 0 END AS efectivo,
      CASE WHEN s.payment_method='debito'        THEN  s.total_amount::float ELSE 0 END AS debito,
      CASE WHEN s.payment_method='credito'       THEN  s.total_amount::float ELSE 0 END AS credito,
      CASE WHEN s.payment_method='mp'            THEN  s.total_amount::float ELSE 0 END AS mp,
      CASE WHEN s.payment_method='transferencia' THEN  s.total_amount::float ELSE 0 END AS transferencia
    FROM sales s
    JOIN branches br   ON br.id  = s.branch_id
    JOIN exchanges ex  ON ex.exchange_sale_id = s.id
    LEFT JOIN app_users uc ON uc.id = ex.user_id
    LEFT JOIN product_variants rv ON rv.id = ex.returned_variant_id
    LEFT JOIN products          rp ON rp.id = rv.product_id
    LEFT JOIN product_variants nv ON nv.id = ex.new_variant_id
    LEFT JOIN products          np ON np.id = nv.product_id
    WHERE s.sold_at::date BETWEEN $1::date AND $2::date

    UNION ALL

    -- ── Gastos (montos negativos) ─────────────────────────────────────────
    SELECT
      'gasto'                            AS type,
      e.id::text                         AS source_id,
      e.created_at                       AS datetime,
      TRIM(CONCAT(
        COALESCE(et.name,'Gasto'),
        CASE WHEN e.description IS NOT NULL AND e.description<>''
          THEN ': '||e.description ELSE '' END
      ))                                 AS description,
      NULL                               AS notes,
      br.name                            AS branch_name,
      e.branch_id,
      e.payment_method,
      COALESCE(ug.name, '')              AS user_name,
      (-e.amount)::float                 AS total,
      CASE WHEN e.payment_method='efectivo'      THEN (-e.amount)::float ELSE 0 END AS efectivo,
      CASE WHEN e.payment_method='debito'        THEN (-e.amount)::float ELSE 0 END AS debito,
      CASE WHEN e.payment_method='credito'       THEN (-e.amount)::float ELSE 0 END AS credito,
      CASE WHEN e.payment_method='mp'            THEN (-e.amount)::float ELSE 0 END AS mp,
      CASE WHEN e.payment_method='transferencia' THEN (-e.amount)::float ELSE 0 END AS transferencia
    FROM daily_expenses e
    JOIN branches br      ON br.id  = e.branch_id
    LEFT JOIN app_users ug ON ug.id = e.user_id
    LEFT JOIN expense_types et ON et.id = e.expense_type_id
    WHERE e.created_at::date BETWEEN $1::date AND $2::date

    UNION ALL

    -- ── Retiros a Caja Central — salida de la sucursal (negativo) ──────
    SELECT
      'retiro'                           AS type,
      ct.id::text                        AS source_id,
      ct.created_at                      AS datetime,
      COALESCE('Retiro: ' || ct.notes, 'Retiro a Caja Central') AS description,
      ct.notes,
      br.name                            AS branch_name,
      ct.from_branch_id                  AS branch_id,
      'efectivo'                         AS payment_method,
      COALESCE(ur.name, '')              AS user_name,
      (-ct.amount)::float                AS total,
      (-ct.amount)::float                AS efectivo,
      0                                  AS debito,
      0                                  AS credito,
      0                                  AS mp,
      0                                  AS transferencia
    FROM cash_transfers ct
    JOIN branches br     ON br.id = ct.from_branch_id
    LEFT JOIN app_users ur ON ur.id = ct.user_id
    WHERE ct.created_at::date BETWEEN $1::date AND $2::date

    UNION ALL

    -- ── Retiros a Caja Central — entrada en Caja Central (positivo) ─────
    SELECT
      'retiro'                           AS type,
      ('c' || ct.id::text)               AS source_id,
      ct.created_at                      AS datetime,
      COALESCE('Retiro de ' || br.name || CASE WHEN ct.notes IS NOT NULL THEN ': ' || ct.notes ELSE '' END,
               'Ingreso desde ' || br.name) AS description,
      ct.notes,
      'Caja Central'                     AS branch_name,
      0                                  AS branch_id,
      'efectivo'                         AS payment_method,
      COALESCE(ur.name, '')              AS user_name,
      ct.amount::float                   AS total,
      ct.amount::float                   AS efectivo,
      0                                  AS debito,
      0                                  AS credito,
      0                                  AS mp,
      0                                  AS transferencia
    FROM cash_transfers ct
    JOIN branches br     ON br.id = ct.from_branch_id
    LEFT JOIN app_users ur ON ur.id = ct.user_id
    WHERE ct.created_at::date BETWEEN $1::date AND $2::date

    ORDER BY datetime DESC
  `, [from, to])

  return NextResponse.json(rows)
}
