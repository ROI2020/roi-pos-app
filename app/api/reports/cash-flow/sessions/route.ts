import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/reports/cash-flow/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD[&branch_id=N]
 *
 * Devuelve todas las sesiones de caja cuya apertura cae dentro del rango,
 * más cualquier sesión que haya quedado abierta desde antes y cierre en el rango.
 * Ordenadas por apertura ASC para que el frontend pueda tomar la primera y la última.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')
  const branchId = searchParams.get('branch_id')

  if (!from || !to)
    return NextResponse.json({ error: 'from y to requeridos' }, { status: 400 })

  const params: (string | number)[] = [from, to]
  let branchWhere = ''
  if (branchId) {
    params.push(parseInt(branchId))
    branchWhere = `AND ps.branch_id = $${params.length}`
  }

  const { rows } = await pool.query(
    `SELECT
       ps.id,
       ps.branch_id,
       br.name                   AS branch_name,
       ps.opened_at,
       ps.opening_balance::float AS opening_balance,
       uo.name                   AS opened_by,
       ps.closed_at,
       ps.closing_balance::float AS closing_balance,
       uc.name                   AS closed_by,
       ps.notes
     FROM pos_sessions ps
     JOIN branches   br ON br.id = ps.branch_id
     LEFT JOIN app_users uo ON uo.id = ps.opened_by_user_id
     LEFT JOIN app_users uc ON uc.id = ps.closed_by_user_id
     WHERE ps.opened_at::date BETWEEN $1::date AND $2::date
     ${branchWhere}
     ORDER BY ps.opened_at ASC`,
    params
  )

  return NextResponse.json(rows)
}
