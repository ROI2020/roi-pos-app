import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { mpPayment } from '@/lib/mp'
import { attemptCJFulfillment } from '@/lib/cj-fulfillment'

/**
 * POST /api/webhooks/mp
 *
 * Recibe notificaciones IPN de MercadoPago.
 *
 * MP envía dos formatos:
 *   a) Query params: ?topic=payment&id=<payment_id>
 *   b) JSON body:   { type: 'payment', data: { id: '<payment_id>' } }
 *
 * Cuando el pago es aprobado:
 *   - online_orders.status  = 'pending'    (listo para que admin confirme)
 *   - online_orders.mp_payment_id = <id>
 *
 * Devuelve 200 siempre para que MP no reintente (los errores internos
 * se loguean pero no se reexponen).
 *
 * Docs: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/notifications/ipn
 */
export async function POST(req: Request) {
  try {
    // ── Extraer payment_id ─────────────────────────────────────────────────
    const url = new URL(req.url)
    let paymentId: string | null = null
    let topic = url.searchParams.get('topic')

    if (topic === 'payment') {
      paymentId = url.searchParams.get('id')
    } else {
      // JSON body (Webhooks API v2)
      try {
        const body = await req.json() as { type?: string; data?: { id?: string } }
        if (body.type === 'payment' && body.data?.id) {
          topic     = 'payment'
          paymentId = String(body.data.id)
        }
      } catch {
        // body vacío o no-JSON — ignorar
      }
    }

    if (!paymentId) {
      // No es notificación de pago (puede ser merchant_order, etc.)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // ── Consultar estado del pago en MP ────────────────────────────────────
    // mpPayment puede ser null si MP_ACCESS_TOKEN no está configurado en el entorno
    if (!mpPayment) {
      console.error('[webhook/mp] MP_ACCESS_TOKEN no configurado — no se puede procesar el webhook')
      return NextResponse.json({ ok: true }, { status: 200 })
    }
    const mpPay = await mpPayment.get({ id: Number(paymentId) })

    const status = mpPay.status               // 'approved' | 'pending' | 'rejected' | ...
    const extRef = mpPay.external_reference   // String(orderId) que pusimos al crear la Preference

    if (!extRef) {
      console.warn('[webhook/mp] Pago sin external_reference:', paymentId)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const orderId = parseInt(extRef, 10)
    if (isNaN(orderId)) {
      console.warn('[webhook/mp] external_reference no es número:', extRef)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // ── Actualizar pedido según el estado ─────────────────────────────────
    if (status === 'approved') {
      // Pago aprobado → el pedido queda 'pending' (a confirmar por el admin)
      await pool.query(
        `UPDATE online_orders
         SET status        = 'pending',
             mp_payment_id = $1
         WHERE id = $2
           AND status = 'awaiting_payment'`,
        [paymentId, orderId]
      )
      console.log(`[webhook/mp] Pedido #${orderId} — pago aprobado (MP id: ${paymentId})`)

      // Auto-fulfillment CJ si está habilitado para el negocio
      attemptCJFulfillment(orderId).catch(e =>
        console.error('[webhook/mp] CJ fulfillment error:', e)
      )

    } else if (status === 'rejected' || status === 'cancelled') {
      // Pago rechazado o cancelado — se puede registrar pero no cambiar estado
      // (el cliente puede volver a intentar con el mismo link o uno nuevo)
      console.log(`[webhook/mp] Pedido #${orderId} — pago ${status} (MP id: ${paymentId})`)
      await pool.query(
        `UPDATE online_orders
         SET mp_payment_id = $1
         WHERE id = $2 AND status = 'awaiting_payment'`,
        [paymentId, orderId]
      )

    } else {
      // 'pending', 'in_process', etc. — MP aún no resolvió
      console.log(`[webhook/mp] Pedido #${orderId} — pago en estado: ${status}`)
    }

    // MP espera 200 para no reintentar
    return NextResponse.json({ ok: true }, { status: 200 })

  } catch (err) {
    console.error('[webhook/mp]', err)
    // Devolvemos 200 igual: si devolvemos 4xx/5xx MP reintenta indefinidamente
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}

// GET — para que MP pueda validar el endpoint (algunos planes lo usan)
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 })
}
