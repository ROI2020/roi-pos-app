import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * POST /api/inventory/assign
 * Body:
 *   variant_ids      number[]   IDs de product_variants a mover
 *   target_branch_id number     Sucursal destino
 *   mode             'asign' | 'reassign'
 *   source_branch_id number?    Requerido cuando mode = 'reassign'
 *
 * En modo 'reassign' primero elimina las filas de source_branch_id,
 * luego inserta en target_branch_id.
 * En modo 'asign' solo inserta (ON CONFLICT DO UPDATE para ser idempotente).
 */
export async function POST(req: Request) {
  try {
    const { variant_ids, target_branch_id, mode, source_branch_id } = await req.json()

    if (!Array.isArray(variant_ids) || variant_ids.length === 0)
      return NextResponse.json({ error: 'variant_ids no puede estar vacío' }, { status: 400 })
    if (!target_branch_id)
      return NextResponse.json({ error: 'target_branch_id es requerido' }, { status: 400 })
    if (mode === 'reassign' && !source_branch_id)
      return NextResponse.json({ error: 'source_branch_id es requerido para reasignación' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // En reasignación, borrar de la sucursal origen
      if (mode === 'reassign') {
        await client.query(
          `DELETE FROM branch_inventory
           WHERE product_variant_id = ANY($1::int[])
             AND branch_id = $2`,
          [variant_ids, source_branch_id]
        )
      }

      // Construir el INSERT multi-fila
      // Evitar lista vacía y respetar el tamaño máximo de parámetros de pg
      const valuePlaceholders = variant_ids
        .map((_: number, i: number) => `($${i * 2 + 1}, $${i * 2 + 2})`)
        .join(', ')
      const flatParams: number[] = variant_ids.flatMap((id: number) => [id, target_branch_id])

      await client.query(
        `INSERT INTO branch_inventory (product_variant_id, branch_id)
         VALUES ${valuePlaceholders}
         ON CONFLICT (product_variant_id, branch_id)
         DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
        flatParams
      )

      await client.query('COMMIT')
      return NextResponse.json({ assigned: variant_ids.length })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[POST /api/inventory/assign]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
