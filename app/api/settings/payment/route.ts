import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/settings/payment
 *
 * Devuelve la configuración de pasarela de pago del negocio.
 * Los campos secretos nunca se exponen — solo se indica si ya tienen valor.
 *
 * Respuesta:
 * {
 *   payment_gateway:          'mercadopago' | 'paypal'
 *   currency:                 string        ('ARS', 'USD')
 *   locale:                   string        ('es-AR', 'en-US')
 *   mp_access_token_set:      boolean
 *   mp_public_key:            string | null
 *   paypal_client_id:         string | null
 *   paypal_client_secret_set: boolean
 *   paypal_mode:              'sandbox' | 'live'
 * }
 */
export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query<{ key: string; value: string | null; is_secret: boolean }>(
    `SELECT key, value, is_secret
     FROM settings
     WHERE business_id = $1
       AND key = ANY(ARRAY[
         'payment_gateway','currency','locale',
         'mp_access_token','mp_public_key',
         'paypal_client_id','paypal_client_secret','paypal_mode','paypal_fop_id'
       ]::text[])`,
    [businessId],
  )

  const map: Record<string, string | null> = {}
  const isSet: Record<string, boolean>     = {}
  for (const r of rows) {
    if (r.is_secret) {
      isSet[r.key] = r.value !== null && r.value.trim().length > 0
    } else {
      map[r.key] = r.value
    }
  }

  return NextResponse.json({
    payment_gateway:          map.payment_gateway          ?? 'mercadopago',
    currency:                 map.currency                 ?? 'ARS',
    locale:                   map.locale                   ?? 'es-AR',
    mp_public_key:            map.mp_public_key            ?? null,
    paypal_client_id:         map.paypal_client_id         ?? null,
    paypal_mode:              map.paypal_mode              ?? 'sandbox',
    paypal_fop_id:            map.paypal_fop_id            ? parseInt(map.paypal_fop_id) : null,
    mp_access_token_set:      isSet.mp_access_token        ?? false,
    paypal_client_secret_set: isSet.paypal_client_secret   ?? false,
  })
}

/**
 * PUT /api/settings/payment
 *
 * Guarda la configuración de pasarela de pago.
 * Para los campos secretos (mp_access_token, paypal_client_secret):
 *   - Si el valor llega vacío o null, se deja el secreto existente sin cambios.
 *   - Si llega con valor, se sobreescribe.
 *
 * Body:
 * {
 *   payment_gateway:       'mercadopago' | 'paypal'
 *   currency:              string
 *   locale:                string
 *   mp_public_key?:        string | null
 *   mp_access_token?:      string | null    // null = no cambiar
 *   paypal_client_id?:     string | null
 *   paypal_client_secret?: string | null    // null = no cambiar
 *   paypal_mode?:          'sandbox' | 'live'
 * }
 */
export async function PUT(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    payment_gateway?:       string
    currency?:              string
    locale?:                string
    mp_public_key?:         string | null
    mp_access_token?:       string | null
    paypal_client_id?:      string | null
    paypal_client_secret?:  string | null
    paypal_mode?:           string
    paypal_fop_id?:         number | null
  }

  // Campos públicos — siempre se escriben
  const publicFields: Array<[string, string | null]> = [
    ['payment_gateway', body.payment_gateway?.trim() || null],
    ['currency',        body.currency?.trim()        || null],
    ['locale',          body.locale?.trim()           || null],
    ['mp_public_key',   body.mp_public_key?.trim()   || null],
    ['paypal_client_id', body.paypal_client_id?.trim() || null],
    ['paypal_mode',     body.paypal_mode?.trim()     || null],
    ['paypal_fop_id',   body.paypal_fop_id != null ? String(body.paypal_fop_id) : null],
  ]

  // Campos secretos — solo se escriben si tienen valor
  const secretFields: Array<[string, string]> = []
  if (body.mp_access_token?.trim()) {
    secretFields.push(['mp_access_token', body.mp_access_token.trim()])
  }
  if (body.paypal_client_secret?.trim()) {
    secretFields.push(['paypal_client_secret', body.paypal_client_secret.trim()])
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const [key, value] of publicFields) {
      // Siempre escribir los campos opcionales (null elimina el valor)
      // Solo saltamos nulls de campos obligatorios como gateway/currency/locale
      if (value === null && !['mp_public_key', 'paypal_client_id', 'paypal_fop_id'].includes(key)) continue
      await client.query(
        `INSERT INTO settings (business_id, key, value, is_secret)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (key, business_id) DO UPDATE
           SET value = EXCLUDED.value, is_secret = false`,
        [businessId, key, value],
      )
    }

    for (const [key, value] of secretFields) {
      await client.query(
        `INSERT INTO settings (business_id, key, value, is_secret)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (key, business_id) DO UPDATE
           SET value = EXCLUDED.value, is_secret = true`,
        [businessId, key, value],
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PUT /api/settings/payment]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
