import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'
import { getPayPalToken, capturePayPalOrder } from '@/lib/paypal'
import { attemptCJFulfillment } from '@/lib/cj-fulfillment'
import { sendOrderConfirmation } from '@/lib/email-order'

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
    const { rows: orderRows } = await pool.query<{ id: number; status: string; total: number }>(
      `SELECT id, status, total::float FROM online_orders WHERE id = $1 AND business_id = $2`,
      [internalOrderId, businessId],
    )
    if (!orderRows.length) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    // Idempotencia: si ya está aprobado, responder OK
    if (orderRows[0].status === 'approved') {
      return NextResponse.json({ success: true, orderId: internalOrderId })
    }

    const dbTotal = orderRows[0].total

    // ── Obtener credenciales PayPal del negocio ────────────────────────────────
    const pubSettings = await getPublicSettingsByKeys(businessId, ['paypal_client_id', 'paypal_mode', 'paypal_fop_id'])
    const clientId    = pubSettings.paypal_client_id
    const mode        = pubSettings.paypal_mode ?? 'sandbox'
    const paypalFopId = pubSettings.paypal_fop_id ? parseInt(pubSettings.paypal_fop_id) : null

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

    // ── Verificar que el monto capturado coincide con nuestro total ───────────
    // Protege contra manipulación del precio en el frontend.
    const captureData     = captured.captures[0]
    const captureId       = captureData?.id ?? null
    const capturedAmount  = parseFloat(captureData?.amount?.value ?? '0')
    const capturedCurrency = captureData?.amount?.currency_code ?? null

    if (capturedAmount < dbTotal - 0.02) {
      // El monto capturado es menor al esperado — posible manipulación de precio.
      // NO aprobamos el pedido. Logueamos el intento.
      console.error(
        `[capture-order] ⚠️  MONTO INSUFICIENTE — orderId=${internalOrderId}`,
        `esperado=${dbTotal} capturado=${capturedAmount} captureId=${captureId}`
      )
      return NextResponse.json(
        {
          error:    'Payment amount mismatch',
          expected: dbTotal,
          received: capturedAmount,
        },
        { status: 402 },
      )
    }

    // ── Actualizar el pedido en DB ────────────────────────────────────────────
    await pool.query(
      `UPDATE online_orders
       SET status                   = 'approved',
           paypal_capture_id        = $1,
           paypal_captured_amount   = $2,
           paypal_captured_currency = $3,
           updated_at               = NOW()
       WHERE id = $4 AND business_id = $5`,
      [captureId, capturedAmount, capturedCurrency, internalOrderId, businessId],
    )

    // ── Registrar en transactions (libro unificado) ───────────────────────────
    // No bloquea la respuesta; si falla, logueamos pero el pago ya está aprobado.
    if (paypalFopId) {
      pool.query(
        `INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount)
         VALUES ($1, NULL, $2, 'online', $3, $4, $5)`,
        [businessId, paypalFopId, internalOrderId, capturedCurrency ?? 'USD', capturedAmount],
      ).catch(e => console.error('[capture-order] transactions insert error:', e))
    } else {
      console.log(
        `[capture-order] paypal_fop_id no configurado — orderId=${internalOrderId} NO registrado en transactions`
      )
    }

    // Auto-fulfillment CJ (no bloquea la respuesta si falla)
    // En sandbox no enviamos a CJ — solo en live se crea la orden real.
    if (mode === 'live') {
      attemptCJFulfillment(internalOrderId).catch(e =>
        console.error('[capture-order] CJ fulfillment error:', e)
      )
    } else {
      console.log(`[capture-order] Sandbox mode — CJ fulfillment skipped para orderId=${internalOrderId}`)
    }

    // Email de confirmación (no bloquea la respuesta)
    sendOrderConfirmation(internalOrderId).catch(e =>
      console.error('[capture-order] email confirmation error:', e)
    )

    return NextResponse.json({ success: true, orderId: internalOrderId })

  } catch (err) {
    console.error('[POST /api/paypal/capture-order]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
