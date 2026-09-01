import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/fops
 *
 * Devuelve todas las formas de pago (fops) del negocio autenticado,
 * uniendo con accounts para filtrar por business_id.
 * Usado en PagosTab para mapear PayPal → FOP.
 */
export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query<{ id: number; name: string; use_for_sales: boolean; account_id: number }>(
    `SELECT f.id, f.name, f.use_for_sales, f.account_id
     FROM fops f
     JOIN accounts a ON a.id = f.account_id
     WHERE a.business_id = $1
     ORDER BY f.id`,
    [businessId],
  )

  return NextResponse.json(rows)
}

/** POST /api/fops — crea una nueva forma de pago dentro de una cuenta */
export async function POST(req: Request) {
  try {
    const { account_id, name, use_for_sales } = await req.json()

    if (!account_id)
      return NextResponse.json({ error: 'La cuenta es obligatoria' }, { status: 400 })
    if (!name?.trim())
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO fops (account_id, name, use_for_sales)
       VALUES ($1, $2, $3)
       RETURNING id, account_id, name, use_for_sales`,
      [parseInt(account_id), name.trim(), use_for_sales ?? true]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    console.error('[POST /api/fops]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
