import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * POST /api/customers/[id]/verify
 * El operador confirma que recibió el mensaje de WhatsApp.
 * Marca al cliente como verificado y limpia el código.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { id } = await params

  const { rows } = await pool.query(
    `UPDATE customers
     SET verified              = true,
         verification_code     = NULL,
         verification_expires  = NULL,
         updated_at            = NOW()
     WHERE id = $1 AND business_id = $2
     RETURNING *`,
    [id, businessId]
  )
  if (!rows[0]) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}
