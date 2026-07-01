import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

export interface BalancePointData {
  costos_fijos:       number
  ventas_mes:         number
  cogs:               number
  gastos_variables:   number
  margen_pct:         number
  punto_equilibrio:   number
  progreso_pct:       number
  dias_transcurridos: number
  dias_restantes:     number | null
  fecha_estimada:     string | null
  alcanzado:          boolean
  detalle_fijos:      { name: string; budget: number }[]
  detalle_variables:  { name: string; amount: number }[]
  sin_datos:          boolean
}

export async function GET() {
  const blocked = await requireFeature('balance.point')
  if (blocked) return blocked

  try {
    const now        = new Date()
    const dayOfMonth = now.getDate()

    const [fixedRes, salesRes, cogsRes, varExpRes] = await Promise.all([

      // 1. Costos fijos presupuestados (del ABM)
      pool.query<{ name: string; budget: string }>(
        `SELECT name, budget::text
         FROM expense_types
         WHERE type = 'fijo' AND active = true
         ORDER BY name`
      ),

      // 2. Ventas del mes actual
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(total_amount), 0)::text AS total
         FROM sales
         WHERE date_trunc('month', sold_at) = date_trunc('month', NOW())`
      ),

      // 3. COGS: costo de mercadería vendida este mes
      //    sale_details → product_variants → purchase_details.unit_cost
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(pd.unit_cost), 0)::text AS total
         FROM sale_details sd
         JOIN sales s             ON s.id  = sd.sale_id
         JOIN product_variants pv ON pv.id = sd.product_variant_id
         LEFT JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
         WHERE date_trunc('month', s.sold_at) = date_trunc('month', NOW())`
      ),

      // 4. Gastos variables reales este mes, agrupados por tipo
      pool.query<{ name: string; amount: string }>(
        `SELECT et.name,
                COALESCE(SUM(de.amount), 0)::text AS amount
         FROM expense_types et
         LEFT JOIN daily_expenses de
           ON de.expense_type_id = et.id
          AND date_trunc('month', de.created_at) = date_trunc('month', NOW())
         WHERE et.type = 'variable' AND et.active = true
         GROUP BY et.name
         ORDER BY et.name`
      ),
    ])

    const detalleF = fixedRes.rows.map(r => ({ name: r.name, budget: parseFloat(r.budget) }))
    const detalleV = varExpRes.rows.map(r => ({ name: r.name, amount: parseFloat(r.amount) }))

    const costos_fijos     = detalleF.reduce((s, r) => s + r.budget, 0)
    const ventas_mes       = parseFloat(salesRes.rows[0]?.total  ?? '0')
    const cogs             = parseFloat(cogsRes.rows[0]?.total   ?? '0')
    const gastos_variables = detalleV.reduce((s, r) => s + r.amount, 0)

    const sin_datos = costos_fijos === 0 && ventas_mes === 0

    let margen_pct       = 0
    let punto_equilibrio = 0

    if (ventas_mes > 0) {
      const contribucion = ventas_mes - cogs - gastos_variables
      margen_pct         = contribucion / ventas_mes
      if (margen_pct > 0 && costos_fijos > 0) {
        punto_equilibrio = costos_fijos / margen_pct
      }
    }

    const progreso_pct = punto_equilibrio > 0
      ? Math.min(ventas_mes / punto_equilibrio, 1)
      : 0

    const alcanzado = punto_equilibrio > 0 && ventas_mes >= punto_equilibrio

    let dias_restantes: number | null = null
    let fecha_estimada: string | null = null

    if (!alcanzado && punto_equilibrio > 0 && ventas_mes > 0 && dayOfMonth > 0) {
      const tasa_diaria = ventas_mes / dayOfMonth
      const faltante    = punto_equilibrio - ventas_mes
      dias_restantes    = Math.ceil(faltante / tasa_diaria)
      const estimada    = new Date(now)
      estimada.setDate(estimada.getDate() + dias_restantes)
      fecha_estimada    = estimada.toISOString().slice(0, 10)
    }

    const body: BalancePointData = {
      costos_fijos,
      ventas_mes,
      cogs,
      gastos_variables,
      margen_pct,
      punto_equilibrio,
      progreso_pct,
      dias_transcurridos: dayOfMonth,
      dias_restantes,
      fecha_estimada,
      alcanzado,
      detalle_fijos:    detalleF,
      detalle_variables: detalleV,
      sin_datos,
    }

    return NextResponse.json(body)

  } catch (err) {
    console.error('[balance-point]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
