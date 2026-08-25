import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { getLabel } from '@/lib/correo/correoArgentino'

/**
 * GET /api/orders/online/:id/label
 *
 * Descarga el rótulo PDF del envío on-demand desde PAQ.AR.
 * No se guarda en DB — se sirve directamente al browser como PDF.
 *
 * Requiere auth.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { id } = await params

  try {
    // Obtener tracking_number del envío
    const { rows } = await pool.query<{
      tracking_number: string; agreement: string
    }>(
      `SELECT sh.tracking_number, cc.agreement
       FROM shipments sh
       JOIN online_orders oo ON oo.id = sh.online_order_id
       JOIN correo_config  cc ON cc.id = sh.correo_config_id
       WHERE oo.id = $1 AND oo.business_id = $2
         AND sh.tracking_number IS NOT NULL`,
      [id, businessId]
    )

    if (!rows.length)
      return NextResponse.json({ error: 'No hay tracking number para este pedido' }, { status: 404 })

    const { tracking_number, agreement } = rows[0]

    // Pedir rótulo a PAQ.AR — usa el agreement como sellerId
    const base64 = await getLabel(tracking_number, agreement)

    // Decodificar y devolver como PDF
    const pdfBuffer = Buffer.from(base64, 'base64')

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="rotulo-${tracking_number}.pdf"`,
        'Content-Length':      String(pdfBuffer.length),
      },
    })
  } catch (err) {
    console.error('[GET /api/orders/online/:id/label]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
