import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/accounts
 *
 * Lista de cuentas con sus formas de pago (fops) anidadas, para el
 * ABM de Configuración → Cuentas y Formas de Pago.
 */
export async function GET() {
  const { rows } = await pool.query(`
    SELECT
      a.id, a.name, a.type, a.currency, a.branch_id,
      COALESCE(br.name, 'Caja Central') AS branch_name,
      COALESCE(
        json_agg(
          json_build_object('id', f.id, 'name', f.name, 'use_for_sales', f.use_for_sales)
          ORDER BY f.id
        ) FILTER (WHERE f.id IS NOT NULL),
        '[]'
      ) AS fops
    FROM accounts a
    LEFT JOIN branches br ON br.id = a.branch_id
    LEFT JOIN fops f      ON f.account_id = a.id
    GROUP BY a.id, a.name, a.type, a.currency, a.branch_id, br.name
    ORDER BY a.branch_id NULLS LAST, a.name
  `)
  return NextResponse.json(rows)
}

/** POST /api/accounts — crea una nueva cuenta */
export async function POST(req: Request) {
  try {
    const { name, type, currency, branch_id } = await req.json()

    if (!name?.trim())
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    if (!type?.trim())
      return NextResponse.json({ error: 'El tipo es obligatorio' }, { status: 400 })

    const branchId = branch_id === null || branch_id === undefined || branch_id === ''
      ? null
      : parseInt(branch_id)

    const { rows } = await pool.query(
      `INSERT INTO accounts (business_id, branch_id, name, type, currency)
       VALUES (1, $1, $2, $3, $4)
       RETURNING id, name, type, currency, branch_id`,
      [branchId, name.trim(), type.trim(), currency?.trim() || 'ARS']
    )
    return NextResponse.json({ ...rows[0], fops: [] }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/accounts]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
