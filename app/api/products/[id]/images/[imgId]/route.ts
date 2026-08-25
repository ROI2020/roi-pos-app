import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * DELETE /api/products/[id]/images/[imgId]
 * Elimina una foto de color del producto.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; imgId: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult

  const { id, imgId } = await params

  const { rowCount } = await pool.query(
    `DELETE FROM product_images WHERE id = $1 AND product_id = $2`,
    [imgId, id]
  )

  if (!rowCount) {
    return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
