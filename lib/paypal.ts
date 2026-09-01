/**
 * lib/paypal.ts — PayPal REST API v2 helpers (server-side only)
 *
 * Sandbox:    https://api-m.sandbox.paypal.com
 * Production: https://api-m.paypal.com
 *
 * Docs: https://developer.paypal.com/api/orders/v2/
 */

function paypalBase(mode: string): string {
  return mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

// ── Access token ─────────────────────────────────────────────────────────────

export async function getPayPalToken(
  clientId:     string,
  clientSecret: string,
  mode = 'sandbox',
): Promise<string> {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(`${paypalBase(mode)}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      Authorization:   `Basic ${creds}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  const data = await res.json() as { access_token?: string; error?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`PayPal token error: ${data.error ?? res.statusText}`)
  }
  return data.access_token
}

// ── Create order ─────────────────────────────────────────────────────────────

export interface PayPalOrderItem {
  name:       string   // max 127 chars
  unit_price: number
  quantity?:  number   // default 1
}

export interface CreatePayPalOrderParams {
  token:       string
  mode:        string
  currency:    string   // 'USD', 'EUR', etc.
  subtotal:    number
  shipping:    number
  items:       PayPalOrderItem[]
  referenceId: string | number   // internal order ID for cross-reference
}

export async function createPayPalOrder(p: CreatePayPalOrderParams): Promise<string> {
  const total = p.subtotal + p.shipping

  const res = await fetch(`${paypalBase(p.mode)}/v2/checkout/orders`, {
    method:  'POST',
    headers: {
      Authorization:              `Bearer ${p.token}`,
      'Content-Type':             'application/json',
      // Idempotency key: retry-safe
      'PayPal-Request-Id': `roi-order-${p.referenceId}-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(p.referenceId),
        amount: {
          currency_code: p.currency,
          value: total.toFixed(2),
          breakdown: {
            item_total: { currency_code: p.currency, value: p.subtotal.toFixed(2) },
            shipping:   { currency_code: p.currency, value: p.shipping.toFixed(2) },
          },
        },
        items: p.items.map(i => ({
          name:        i.name.slice(0, 127),
          unit_amount: { currency_code: p.currency, value: i.unit_price.toFixed(2) },
          quantity:    String(i.quantity ?? 1),
          category:    'PHYSICAL_GOODS',
        })),
      }],
    }),
    cache: 'no-store',
  })

  const data = await res.json() as { id?: string; details?: unknown }
  if (!res.ok || !data.id) {
    throw new Error(`PayPal createOrder failed (${res.status}): ${JSON.stringify(data.details ?? data)}`)
  }
  return data.id
}

// ── Capture order ────────────────────────────────────────────────────────────

interface PayPalCapture {
  id:     string
  status: string
  amount: { currency_code: string; value: string }
}

export interface PayPalCaptureResult {
  status:   string   // 'COMPLETED' | 'PAYER_ACTION_REQUIRED' | ...
  orderId:  string   // PayPal order ID
  captures: PayPalCapture[]
}

export async function capturePayPalOrder(
  token:          string,
  mode:           string,
  paypalOrderId:  string,
): Promise<PayPalCaptureResult> {
  const res = await fetch(
    `${paypalBase(mode)}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method:  'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
  )
  const data = await res.json() as {
    status?: string
    id?:     string
    purchase_units?: Array<{
      payments?: { captures?: PayPalCapture[] }
    }>
    details?: unknown
  }
  if (!res.ok) {
    throw new Error(`PayPal capture failed (${res.status}): ${JSON.stringify(data.details ?? data)}`)
  }
  const captures = data.purchase_units?.[0]?.payments?.captures ?? []
  return {
    status:  data.status ?? 'UNKNOWN',
    orderId: data.id ?? paypalOrderId,
    captures,
  }
}

// ── Verify webhook signature ──────────────────────────────────────────────────

interface VerifyWebhookParams {
  token:         string
  mode:          string
  webhookId:     string
  headers: {
    transmissionId:   string
    transmissionTime: string
    certUrl:          string
    authAlgo:         string
    transmissionSig:  string
  }
  body: string   // raw JSON string
}

/**
 * Verifica la firma de un webhook de PayPal.
 * Devuelve true si la verificación es exitosa.
 */
export async function verifyPayPalWebhook(p: VerifyWebhookParams): Promise<boolean> {
  try {
    const res = await fetch(
      `${paypalBase(p.mode)}/v1/notifications/verify-webhook-signature`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${p.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo:         p.headers.authAlgo,
          cert_url:          p.headers.certUrl,
          transmission_id:   p.headers.transmissionId,
          transmission_sig:  p.headers.transmissionSig,
          transmission_time: p.headers.transmissionTime,
          webhook_id:        p.webhookId,
          webhook_event:     JSON.parse(p.body),
        }),
        cache: 'no-store',
      },
    )
    const data = await res.json() as { verification_status?: string }
    return data.verification_status === 'SUCCESS'
  } catch {
    return false
  }
}
