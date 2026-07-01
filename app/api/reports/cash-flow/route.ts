import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

/**
 * GET /api/reports/cash-flow?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve todos los movimientos de caja en el rango dado:
 *   - Ventas (sales, excluye cambios que tienen su propio tipo)
 *   - Cambios (exchanges — solo la diferencia de precio, si hubo)
 *   - Gastos  (daily_expenses — montos negativos)
 *   - Retiros (cash_transfers — 2 patas: sale de sucursal / entra a Central)
 *
 * Fuente: `transactions` (vía fops para resolver la forma de pago de
 * cada movimiento), en vez de leer sales/daily_expenses/exchanges/
 * cash_transfers directamente. Una venta con pago dividido genera
 * varias filas en transactions (una por fop) que acá se vuelven a
 * pivotear en una sola fila por venta, igual que antes.
 *
 * Nota: a diferencia de la versión anterior, un cambio sin diferencia
 * de plata (difference_amount = 0) ya no aparece acá — no es un
 * movimiento de caja. Sigue visible en la solapa Ventas.
 *
 * Cada fila incluye los importes desagregados por forma de pago
 * para poder armar totales por columna en el frontend.
 */
export async function GET(req: Request) {
  const blocked = await requireFeature('finance.transactions')
  if (blocked) return blocked

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to son requeridos (YYYY-MM-DD)' }, { status: 400 })

  const { rows } = await pool.query(`
    WITH tx_agg AS (
      SELECT
        t.type, t.type_id,
        SUM(t.amount)::float AS total,
        SUM(CASE WHEN f.name='Efectivo'      THEN t.amount ELSE 0 END)::float AS efectivo,
        SUM(CASE WHEN f.name='Debito'        THEN t.amount ELSE 0 END)::float AS debito,
        SUM(CASE WHEN f.name='Credito'       THEN t.amount ELSE 0 END)::float AS credito,
        SUM(CASE WHEN f.name='QR'            THEN t.amount ELSE 0 END)::float AS mp,
        SUM(CASE WHEN f.name='Transferencia' THEN t.amount ELSE 0 END)::float AS transferencia
      FROM transactions t
      JOIN fops f ON f.id = t.fop_id
      WHERE t.type IN ('sale','expense','exchange')
      GROUP BY t.type, t.type_id
    )

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
      tx.total, tx.efectivo, tx.debito, tx.credito, tx.mp, tx.transferencia
    FROM tx_agg tx
    JOIN sales s ON s.id = tx.type_id AND tx.type = 'sale'
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
      tx.total, tx.efectivo, tx.debito, tx.credito, tx.mp, tx.transferencia
    FROM tx_agg tx
    JOIN exchanges ex ON ex.id = tx.type_id AND tx.type = 'exchange'
    JOIN sales s        ON s.id = ex.exchange_sale_id
    JOIN branches br    ON br.id = s.branch_id
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
      NULL::text                         AS notes,
      br.name                            AS branch_name,
      e.branch_id,
      e.payment_method,
      COALESCE(ug.name, '')              AS user_name,
      tx.total, tx.efectivo, tx.debito, tx.credito, tx.mp, tx.transferencia
    FROM tx_agg tx
    JOIN daily_expenses e ON e.id = tx.type_id AND tx.type = 'expense'
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
      t.amount::float                    AS total,
      t.amount::float                    AS efectivo,
      0                                  AS debito,
      0                                  AS credito,
      0                                  AS mp,
      0                                  AS transferencia
    FROM transactions t
    JOIN cash_transfers ct ON ct.id = t.type_id AND t.type = 'transfer' AND t.branch_id IS NOT NULL
    JOIN branches br       ON br.id = ct.from_branch_id
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
      t.amount::float                    AS total,
      t.amount::float                    AS efectivo,
      0                                  AS debito,
      0                                  AS credito,
      0                                  AS mp,
      0                                  AS transferencia
    FROM transactions t
    JOIN cash_transfers ct ON ct.id = t.type_id AND t.type = 'transfer' AND t.branch_id IS NULL
    JOIN branches br       ON br.id = ct.from_branch_id
    LEFT JOIN app_users ur ON ur.id = ct.user_id
    WHERE ct.created_at::date BETWEEN $1::date AND $2::date

    ORDER BY datetime DESC
  `, [from, to])

  return NextResponse.json(rows)
}
