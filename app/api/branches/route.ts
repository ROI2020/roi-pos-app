import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

/** GET /api/branches — lista todas las sucursales */
export async function GET() {
  const { rows } = await pool.query(
    `SELECT id, name, address, arca_pos_number, is_default
     FROM branches
     ORDER BY is_default DESC, name`
  )
  return NextResponse.json(rows)
}

/** POST /api/branches — crea una nueva sucursal */
export async function POST(req: Request) {
  const blocked = await requireFeature('branch.multi')
  if (blocked) return blocked

  try {
    const { name, address, arca_pos_number } = await req.json()

    if (!name?.trim())
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

    const arcaNum = parseInt(arca_pos_number ?? '0')
    if (isNaN(arcaNum))
      return NextResponse.json({ error: 'El número ARCA debe ser un entero' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO branches (name, address, arca_pos_number)
       VALUES ($1, $2, $3)
       RETURNING id, name, address, arca_pos_number`,
      [name.trim(), address?.trim() || null, arcaNum]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    console.error('[POST /api/branches]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
