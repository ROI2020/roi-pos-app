import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query(
    `SELECT id, name, long_name FROM categories WHERE business_id = $1 ORDER BY name`,
    [businessId]
  ).catch(async () => {
    // Fallback si long_name no existe todavía (migration pendiente)
    return pool.query(
      'SELECT id, name, NULL::text AS long_name FROM categories WHERE business_id = $1 ORDER BY name',
      [businessId]
    )
  })
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  try {
    const body = await req.json() as { name?: string; long_name?: string }
    if (!body.name?.trim())
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

    const name      = body.name.trim().slice(0, 150)
    const longName  = (body.long_name?.trim() || name).slice(0, 300)

    const { rows } = await pool.query(
      `INSERT INTO categories (name, long_name, business_id) VALUES ($1, $2, $3)
       RETURNING id, name, long_name`,
      [name, longName, businessId]
    ).catch(async () => {
      // Fallback si long_name no existe todavía
      return pool.query(
        'INSERT INTO categories (name, business_id) VALUES ($1, $2) RETURNING id, name, NULL::text AS long_name',
        [name, businessId]
      )
    })
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'Ya existe esa categoría' }, { status: 409 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * PATCH /api/categories
 * Body: { id: number; name?: string; long_name?: string }
 * Permite renombrar la categoría sin pisar el nombre original (long_name).
 * name NO se actualiza si no viene en el body (protege la curación del admin).
 */
export async function PATCH(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  try {
    const body = await req.json() as { id?: number; name?: string; long_name?: string }
    if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const sets: string[] = []
    const vals: unknown[] = []
    if (body.name !== undefined)      { sets.push(`name = $${sets.length + 1}`);      vals.push(body.name.trim().slice(0, 150)) }
    if (body.long_name !== undefined) { sets.push(`long_name = $${sets.length + 1}`); vals.push(body.long_name.trim().slice(0, 300) || null) }
    if (sets.length === 0) return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })

    vals.push(body.id, businessId)
    const { rows } = await pool.query(
      `UPDATE categories SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND business_id = $${vals.length} RETURNING id, name, long_name`,
      vals
    )
    if (!rows.length) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
