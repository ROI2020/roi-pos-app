import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * POST /api/snapshots/stock
 * Body: { branch_id: number, pos_session_id: number }
 *
 * Graba (o actualiza si ya existe) el snapshot del día para una sucursal.
 * Se llama al cerrar la caja.  Usa ON CONFLICT para ser idempotente.
 */
export async function POST(req: Request) {
  const { branch_id, pos_session_id } = await req.json()
  if (!branch_id)
    return NextResponse.json({ error: 'branch_id requerido' }, { status: 400 })

  try {
    await pool.query(
      `INSERT INTO stock_snapshots
         (snapshot_date, branch_id, stock_units, stock_cost, stock_list_price,
          sold_units, daily_sales, pos_session_id)
       SELECT
         (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
         $1::int,
         COALESCE(st.units,      0),
         COALESCE(st.cost,       0),
         COALESCE(st.list_price, 0),
         COALESCE(sv.sold_units, 0),
         COALESCE(sv.daily_sales, 0),
         $2::int
       FROM
         -- Stock disponible en esta sucursal (no vendido)
         (SELECT
            COUNT(bi.id)::int                     AS units,
            SUM(COALESCE(pd.unit_cost,   0))      AS cost,
            SUM(COALESCE(p.base_price,   0))      AS list_price
          FROM branch_inventory bi
          JOIN product_variants pv ON pv.id = bi.product_variant_id
          JOIN products          p  ON p.id  = pv.product_id
          LEFT JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
          WHERE bi.branch_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM sale_details sd WHERE sd.product_variant_id = pv.id
            )
         ) st,
         -- Ventas del día en esta sucursal
         (SELECT
            COUNT(DISTINCT sd.product_variant_id)::int  AS sold_units,
            COALESCE(SUM(s.total_amount), 0)            AS daily_sales
          FROM sales s
          JOIN sale_details sd ON sd.sale_id = s.id
          WHERE s.branch_id = $1
            AND s.sold_at::date =
              (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
         ) sv
       ON CONFLICT (snapshot_date, branch_id) DO UPDATE SET
         stock_units      = EXCLUDED.stock_units,
         stock_cost       = EXCLUDED.stock_cost,
         stock_list_price = EXCLUDED.stock_list_price,
         sold_units       = EXCLUDED.sold_units,
         daily_sales      = EXCLUDED.daily_sales,
         pos_session_id   = EXCLUDED.pos_session_id,
         created_at       = CURRENT_TIMESTAMP`,
      [branch_id, pos_session_id ?? null]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/snapshots/stock]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * GET /api/snapshots/stock?mode=week|month|year
 *
 * Devuelve los puntos de los gráficos históricos.
 *   week  → últimos 7 días, un punto por día
 *   month → últimos 30 días, un punto por día
 *   year  → últimos 12 meses, un punto por mes (SUM de diarios)
 *
 * Formato de respuesta:
 *   {
 *     labels: string[],
 *     branches: { id, name, stock_units[], sold_units[],
 *                 stock_cost[], stock_list_price[], daily_sales[] }[]
 *   }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'week'

  let dateFilter: string
  let labelExpr: string
  let groupExpr: string

  if (mode === 'year') {
    dateFilter = `ss.snapshot_date >= (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '11 months'`
    labelExpr  = `TO_CHAR(date_trunc('month', ss.snapshot_date), 'MM/YYYY')`
    groupExpr  = `date_trunc('month', ss.snapshot_date)`
  } else if (mode === 'month') {
    dateFilter = `ss.snapshot_date >= (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '29 days'`
    labelExpr  = `TO_CHAR(ss.snapshot_date, 'DD/MM')`
    groupExpr  = `ss.snapshot_date`
  } else {
    // week
    dateFilter = `ss.snapshot_date >= (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '6 days'`
    labelExpr  = `TO_CHAR(ss.snapshot_date, 'DD/MM')`
    groupExpr  = `ss.snapshot_date`
  }

  // Para año, usamos el último snapshot del mes como representativo del stock
  // y sum para ventas/vendido. Para día usamos los valores directos.
  const stockAgg = mode === 'year'
    ? `(ARRAY_AGG(ss.stock_units      ORDER BY ss.snapshot_date DESC))[1]`
    : `ss.stock_units`
  const costAgg = mode === 'year'
    ? `(ARRAY_AGG(ss.stock_cost       ORDER BY ss.snapshot_date DESC))[1]`
    : `ss.stock_cost`
  const listAgg = mode === 'year'
    ? `(ARRAY_AGG(ss.stock_list_price ORDER BY ss.snapshot_date DESC))[1]`
    : `ss.stock_list_price`

  const { rows } = await pool.query(`
    SELECT
      ${labelExpr}          AS label,
      ss.branch_id,
      br.name               AS branch_name,
      ${mode === 'year'
        ? `(ARRAY_AGG(ss.stock_units      ORDER BY ss.snapshot_date DESC))[1]::int    AS stock_units,
           (ARRAY_AGG(ss.stock_cost       ORDER BY ss.snapshot_date DESC))[1]::float  AS stock_cost,
           (ARRAY_AGG(ss.stock_list_price ORDER BY ss.snapshot_date DESC))[1]::float  AS stock_list_price,
           SUM(ss.sold_units)::int                                                     AS sold_units,
           SUM(ss.daily_sales)::float                                                  AS daily_sales`
        : `ss.stock_units::int          AS stock_units,
           ss.stock_cost::float         AS stock_cost,
           ss.stock_list_price::float   AS stock_list_price,
           ss.sold_units::int           AS sold_units,
           ss.daily_sales::float        AS daily_sales`
      }
    FROM stock_snapshots ss
    JOIN branches br ON br.id = ss.branch_id
    WHERE ${dateFilter}
    GROUP BY ${groupExpr}, ss.branch_id, br.name
      ${mode !== 'year' ? ', ss.stock_units, ss.stock_cost, ss.stock_list_price, ss.sold_units, ss.daily_sales' : ''}
    ORDER BY ${groupExpr}, br.name
  `)

  // Pivotear: de filas a { labels, branches[] }
  const labelSet = [...new Set(rows.map(r => r.label))]
  const branchMap = new Map<number, { id: number; name: string; data: Map<string, typeof rows[0]> }>()

  for (const row of rows) {
    if (!branchMap.has(row.branch_id)) {
      branchMap.set(row.branch_id, { id: row.branch_id, name: row.branch_name, data: new Map() })
    }
    branchMap.get(row.branch_id)!.data.set(row.label, row)
  }

  const branches = Array.from(branchMap.values()).map(b => ({
    id:              b.id,
    name:            b.name,
    stock_units:     labelSet.map(l => b.data.get(l)?.stock_units     ?? null),
    sold_units:      labelSet.map(l => b.data.get(l)?.sold_units      ?? null),
    stock_cost:      labelSet.map(l => b.data.get(l)?.stock_cost      ?? null),
    stock_list_price:labelSet.map(l => b.data.get(l)?.stock_list_price ?? null),
    daily_sales:     labelSet.map(l => b.data.get(l)?.daily_sales     ?? null),
  }))

  return NextResponse.json({ labels: labelSet, branches })
}
