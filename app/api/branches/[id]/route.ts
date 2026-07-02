import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeature } from '@/lib/plan-gate'

/**
 * PATCH /api/branches/[id]
 * Body: { name?, address?, arca_pos_number?, is_default? }
 * Si is_default=true, desactiva todas las demás sucursales como favorita.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await requireFeature('branch.multi')
  if (blocked) return blocked

  const { id } = await params
  const body   = await req.json() as Record<string, unknown>
  const bid    = parseInt(id)

  const allowed = ['name', 'address', 'arca_pos_number', 'is_default', 'cuit_emisor']
  const updates = Object.entries(body).filter(([k]) => allowed.includes(k))
  if (updates.length === 0)
    return NextResponse.json({ error: 'Sin campos' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Si se marca como favorita, primero quitarla a todas las demás
    if (body.is_default === true) {
      await client.query(`UPDATE branches SET is_default = false WHERE id != $1`, [bid])
    }

    const setClauses = updates.map(([k], i) => `${k} = $${i + 1}`).join(', ')
    const values     = updates.map(([, v]) => v)
    values.push(bid)

    const { rows } = await client.query(
      `UPDATE branches SET ${setClauses} WHERE id = $${values.length}
       RETURNING id, name, address, arca_pos_number, cuit_emisor, is_default`,
      values
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })
    }
    await client.query('COMMIT')
    return NextResponse.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
