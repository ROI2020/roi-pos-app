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
      s.total_amount::float              AS total,
      CASE WHEN s.payment_method='efectivo'      THEN  s.total_amount::float ELSE 0 END AS efectivo,
      CASE WHEN s.payment_method='debito'        THEN  s.total_amount::float ELSE 0 END AS debito,
      CASE WHEN s.payment_method='credito'       THEN  s.total_amount::float ELSE 0 END AS credito,
      CASE WHEN s.payment_method='mp'            THEN  s.total_amount::float ELSE 0 END AS mp,
      CASE WHEN s.payment_method='transferencia' THEN  s.total_amount::float ELSE 0 END AS transferencia
    FROM sales s
    JOIN branches br ON br.id = s.branch_id
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
      s.total_amount::float              AS total,
      CASE WHEN s.payment_method='efectivo'      THEN  s.total_amount::float ELSE 0 END AS efectivo,
      CASE WHEN s.payment_method='debito'        THEN  s.total_amount::float ELSE 0 END AS debito,
      CASE WHEN s.payment_method='credito'       THEN  s.total_amount::float ELSE 0 END AS credito,
      CASE WHEN s.payment_method='mp'            THEN  s.total_amount::float ELSE 0 END AS mp,
      CASE WHEN s.payment_method='transferencia' THEN  s.total_amount::float ELSE 0 END AS transferencia
    FROM sales s
    JOIN branches br   ON br.id  = s.branch_id
    JOIN exchanges ex  ON ex.exchange_sale_id = s.id
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
      (-e.amount)::float                 AS total,
      CASE WHEN e.payment_method='efectivo'      THEN (-e.amount)::float ELSE 0 END AS efectivo,
      CASE WHEN e.payment_method='debito'        THEN (-e.amount)::float ELSE 0 END AS debito,
      CASE WHEN e.payment_method='credito'       THEN (-e.amount)::float ELSE 0 END AS credito,
      CASE WHEN e.payment_method='mp'            THEN (-e.amount)::float ELSE 0 END AS mp,
      CASE WHEN e.payment_method='transferencia' THEN (-e.amount)::float ELSE 0 END AS transferencia
    FROM daily_expenses e
    JOIN branches br      ON br.id  = e.branch_id
    LEFT JOIN expense_types et ON et.id = e.expense_type_id
    WHERE e.created_at::date BETWEEN $1::date AND $2::date

    ORDER BY datetime DESC
  `, [from, to])

  return NextResponse.json(rows)
}
