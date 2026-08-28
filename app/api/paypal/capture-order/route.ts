import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'
import { getPayPalToken, capturePayPalOrder } from '@/lib/paypal'
import { attemptCJFulfillment } from '@/lib/cj-fulfillment'

/**
 * POST /api/paypal/capture-order
 *
 * Endpoint PÚBLICO — sin autenticación.
 * Captura sincrónicamente el pago aprobado por PayPal y actualiza el pedido en DB.
 *
 * Body:
 * { paypalOrderId: string, internalOrderId: number }
 *
 * Responde:
 * { success: true, orderId: number }
 */
export async function POST(req: Request) {
  try {
    const host       = req.headers.get('host') ?? ''
    const businessId = await resolveBusinessFromHost(host)

    const body = await req.json() as { paypalOrderId?: string; internalOrderId?: number }
    const { paypalOrderId, internalOrderId } = body

    if (!paypalOrderId)  return NextResponse.json({ error: 'paypalOrderId requerido' },  { status: 400 })
    if (!internalOrderId) return NextResponse.json({ error: 'internalOrderId requerido' }, { status: 400 })

    // ── Verificar que la orden pertenece a este negocio ────────────────────────
    const { rows: orderRows } = await pool.query<{ id: number; status: string }>(
      `SELECT id, status FROM online_orders WHERE id = $1 AND business_id = $2`,
      [internalOrderId, businessId],
    )
    if (!orderRows.length) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    // Idempotencia: si ya está aprobado, responder OK
    if (orderRows[0].status === 'approved') {
      return NextResponse.json({ success: true, orderId: internalOrderId })
    }

    // ── Obtener credenciales PayPal del negocio ────────────────────────────────
    const pubSettings = await getPublicSettingsByKeys(businessId, ['paypal_client_id', 'paypal_mode'])
    const clientId    = pubSettings.paypal_client_id
    const mode        = pubSettings.paypal_mode ?? 'sandbox'

    if (!clientId) {
      return NextResponse.json({ error: 'PayPal no configurado' }, { status: 503 })
    }

    const clientSecret = await getSecretSetting(businessId, 'paypal_client_secret')
    if (!clientSecret) {
      return NextResponse.json({ error: 'Credenciales PayPal incompletas' }, { status: 503 })
    }

    // ── Capturar el pago en PayPal ────────────────────────────────────────────
    const token    = await getPayPalToken(clientId, clientSecret, mode)
    const captured = await capturePayPalOrder(token, mode, paypalOrderId)

    if (captured.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: `PayPal capture status: ${captured.status}` },
        { status: 402 },
      )
    }

    // ── Actualizar el pedido en DB ────────────────────────────────────────────
    const captureId = captured.captures[0]?.id ?? null

    await pool.query(
      `UPDATE online_orders
       SET status           = 'approved',
           paypal_capture_id = $1,
           updated_at        = NOW()
       WHERE id = $2 AND business_id = $3`,
      [captureId, internalOrderId, businessId],
    )

    // Auto-fulfillment CJ (no bloquea la respuesta si falla)
    attemptCJFulfillment(internalOrderId).catch(e =>
      console.error('[capture-order] CJ fulfillment error:', e)
    )

    return NextResponse.json({ success: true, orderId: internalOrderId })

  } catch (err) {
    console.error('[POST /api/paypal/capture-order]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
