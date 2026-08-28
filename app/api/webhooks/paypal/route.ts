import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'
import { getPayPalToken, verifyPayPalWebhook } from '@/lib/paypal'

/**
 * POST /api/webhooks/paypal
 *
 * Webhook de seguridad de PayPal — net de seguridad para capturas.
 * El happy path captura sincrónicamente en /api/paypal/capture-order,
 * pero si el usuario cierra la ventana antes de que se ejecute el callback
 * de onApprove, este webhook actualiza el pedido igualmente.
 *
 * Configurable en PayPal Developer Dashboard → Webhooks.
 * Evento: PAYMENT.CAPTURE.COMPLETED
 *
 * La verificación usa el business_id resuelto desde el reference_id del pedido.
 */
export async function POST(req: Request) {
  const rawBody = await req.text()

  try {
    // ── Leer headers de firma PayPal ──────────────────────────────────────────
    const transmissionId   = req.headers.get('paypal-transmission-id')   ?? ''
    const transmissionTime = req.headers.get('paypal-transmission-time') ?? ''
    const certUrl          = req.headers.get('paypal-cert-url')          ?? ''
    const authAlgo         = req.headers.get('paypal-auth-algo')         ?? ''
    const transmissionSig  = req.headers.get('paypal-transmission-sig')  ?? ''

    // ── Parsear el evento ─────────────────────────────────────────────────────
    let event: {
      event_type?: string
      resource?: {
        id?:         string   // capture ID
        status?:     string
        amount?:     { currency_code: string; value: string }
        supplementary_data?: {
          related_ids?: { order_id?: string }
        }
        purchase_units?: Array<{
          reference_id?: string
        }>
      }
    }
    try {
      event = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
      // Otros eventos: responder 200 sin procesar
      return NextResponse.json({ ignored: true })
    }

    const captureId = event.resource?.id
    if (!captureId) {
      return NextResponse.json({ error: 'Sin capture ID' }, { status: 400 })
    }

    // ── Obtener business_id desde paypal_capture_id o buscar por amount/time ──
    // PayPal no incluye el reference_id directamente en el webhook de capture,
    // pero lo tenemos en PAYMENT.CAPTURE.COMPLETED → resource.supplementary_data.
    // Estrategia: buscar el pedido por paypal_capture_id (ya guardado si la captura
    // síncrona funcionó) o actualizar cualquier pedido con status awaiting_payment
    // cuyo paypal_capture_id es null (fallback).

    // Primero: ¿ya fue capturado sincrónicamente?
    const { rows: existingRows } = await pool.query<{ id: number }>(
      `SELECT id FROM online_orders WHERE paypal_capture_id = $1`,
      [captureId],
    )
    if (existingRows.length > 0) {
      // Ya procesado — idempotente
      return NextResponse.json({ ok: true, already: true })
    }

    // El reference_id del purchase_unit es el internalOrderId
    const referenceId = event.resource?.supplementary_data?.related_ids?.order_id
    if (!referenceId) {
      // No podemos identificar el pedido — loguear y responder 200 para que
      // PayPal no reintente. (El pedido quedará en awaiting_payment hasta que
      // el admin lo revise manualmente.)
      console.warn('[webhook/paypal] No reference_id en evento PAYMENT.CAPTURE.COMPLETED', { captureId })
      return NextResponse.json({ ok: true, warning: 'no_reference_id' })
    }

    // ── Buscar el pedido por referenceId (el orderId interno de PayPal) ───────
    // PayPal almacena el reference_id del purchase_unit como el orderId de PayPal.
    // Necesitamos buscar por el paypal_order_id que guardamos en mp_preference_id.
    // En realidad, el reference_id en createPayPalOrder fue el internalOrderId.
    const { rows: orderRows } = await pool.query<{ id: number; business_id: number; status: string }>(
      `SELECT id, business_id, status
       FROM online_orders
       WHERE id = $1`,
      [referenceId],
    )
    if (!orderRows.length) {
      console.warn('[webhook/paypal] Pedido no encontrado para reference_id', referenceId)
      return NextResponse.json({ ok: true, warning: 'order_not_found' })
    }

    const { id: orderId, business_id: businessId, status } = orderRows[0]

    // Si ya está aprobado, idempotente
    if (status === 'approved') {
      return NextResponse.json({ ok: true, already: true })
    }

    // ── Verificar la firma del webhook ────────────────────────────────────────
    const pubSettings  = await getPublicSettingsByKeys(businessId, ['paypal_client_id', 'paypal_mode'])
    const clientId     = pubSettings.paypal_client_id
    const mode         = pubSettings.paypal_mode ?? 'sandbox'
    const clientSecret = await getSecretSetting(businessId, 'paypal_client_secret')
    const webhookId    = process.env.PAYPAL_WEBHOOK_ID ?? ''   // configurar en .env

    if (clientId && clientSecret && webhookId) {
      const token = await getPayPalToken(clientId, clientSecret, mode)
      const valid = await verifyPayPalWebhook({
        token, mode, webhookId,
        headers: { transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig },
        body: rawBody,
      })
      if (!valid) {
        console.warn('[webhook/paypal] Firma inválida para orden', orderId)
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
      }
    } else {
      console.warn('[webhook/paypal] Sin PAYPAL_WEBHOOK_ID — omitiendo verificación de firma')
    }

    // ── Actualizar pedido ─────────────────────────────────────────────────────
    await pool.query(
      `UPDATE online_orders
       SET status            = 'approved',
           paypal_capture_id = $1,
           updated_at        = NOW()
       WHERE id = $2`,
      [captureId, orderId],
    )

    console.info('[webhook/paypal] Pedido', orderId, 'aprobado. Capture:', captureId)
    return NextResponse.json({ ok: true, orderId })

  } catch (err) {
    console.error('[POST /api/webhooks/paypal]', err)
    // Responder 200 para evitar reintentos de PayPal ante errores transitorios
    return NextResponse.json({ error: String(err) })
  }
}
