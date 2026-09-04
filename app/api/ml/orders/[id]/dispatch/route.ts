/**
 * POST /api/ml/orders/[id]/dispatch
 *
 * Envía el mensaje de despacho al comprador de una orden ML.
 * Opcionalmente adjunta el PDF de la factura vinculada a la venta.
 *
 * Body:
 *   {
 *     trackingNumber: string
 *     carrier?:       string   — default "Correo Argentino"
 *     attachInvoice?: boolean  — si true y existe factura, la adjunta
 *   }
 *
 * [id] = ml_orders.id (nuestro ID interno, no el de ML)
 */

import { NextResponse }          from 'next/server'
import pool                      from '@/lib/db'
import { requireBusinessId }     from '@/lib/get-business-id'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { sendMLDispatched }      from '@/lib/ml-messages'
import fs                        from 'node:fs/promises'

interface MLOrderRecord {
  id:                  number
  ml_order_id:         string
  pack_id:             string | null
  buyer_id:            string
  buyer_nickname:      string | null
  status:              string
  msg_dispatched_sent: boolean
  sale_id:             number | null
}

interface FacturaRecord {
  pdf_path: string | null
  id:       string
}

export async function POST(
  req:     Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { id } = await params
  const mlOrderDbId = parseInt(id)

  const { trackingNumber, carrier = 'Correo Argentino', attachInvoice = false } =
    await req.json() as {
      trackingNumber?: string
      carrier?:        string
      attachInvoice?:  boolean
    }

  if (!trackingNumber?.trim()) {
    return NextResponse.json({ error: 'trackingNumber requerido' }, { status: 400 })
  }

  // ── Cargar orden ML ───────────────────────────────────────────────────────────
  const { rows: orderRows } = await pool.query<MLOrderRecord>(
    `SELECT id, ml_order_id::text, pack_id::text, buyer_id::text, buyer_nickname,
            status, msg_dispatched_sent, sale_id
     FROM ml_orders
     WHERE id = $1 AND business_id = $2`,
    [mlOrderDbId, businessId],
  )

  if (!orderRows.length) {
    return NextResponse.json({ error: 'Orden ML no encontrada' }, { status: 404 })
  }

  const order = orderRows[0]

  // ── Obtener seller ID ─────────────────────────────────────────────────────────
  const pub      = await getPublicSettingsByKeys(businessId, ['ml_user_id'])
  const sellerId = pub.ml_user_id?.trim()
  if (!sellerId) {
    return NextResponse.json({ error: 'ML no configurado (ml_user_id vacío)' }, { status: 400 })
  }

  const packId = order.pack_id ?? order.ml_order_id

  // ── PDF de factura (opcional) ─────────────────────────────────────────────────
  let invoicePdf: Buffer | undefined

  if (attachInvoice && order.sale_id) {
    try {
      const { rows: factRows } = await pool.query<FacturaRecord>(
        `SELECT id::text, pdf_path
         FROM facturas
         WHERE sale_id = $1
         LIMIT 1`,
        [order.sale_id],
      )
      const factura = factRows[0]

      if (factura?.pdf_path) {
        try {
          invoicePdf = await fs.readFile(factura.pdf_path)
        } catch {
          // Si no existe el archivo físico → intentamos generar el PDF
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
          const pdfRes  = await fetch(
            `${baseUrl}/api/facturacion/pdf/${factura.id}`,
            { headers: { 'x-api-key': process.env.FACTURACION_API_KEY ?? '' } },
          )
          if (pdfRes.ok) {
            invoicePdf = Buffer.from(await pdfRes.arrayBuffer())
          }
        }
      }
    } catch (e) {
      console.warn(`[ml/orders/dispatch] No se pudo obtener factura para sale ${order.sale_id}:`, e)
      // Continúa sin adjunto
    }
  }

  // ── Enviar mensaje de despacho ────────────────────────────────────────────────
  const sent = await sendMLDispatched(
    businessId,
    packId,
    sellerId,
    parseInt(order.buyer_id),
    order.buyer_nickname ?? 'comprador',
    trackingNumber.trim(),
    carrier,
    invoicePdf,
  )

  if (!sent) {
    return NextResponse.json(
      { error: 'No se pudo enviar el mensaje a ML. Verificá que la cuenta siga conectada.' },
      { status: 502 },
    )
  }

  // Marcar como enviado
  await pool.query(
    `UPDATE ml_orders
     SET msg_dispatched_sent = TRUE, updated_at = NOW()
     WHERE id = $1`,
    [mlOrderDbId],
  )

  return NextResponse.json({
    ok:              true,
    trackingNumber,
    invoiceAttached: Boolean(invoicePdf),
  })
}
