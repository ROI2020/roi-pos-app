import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { PoolClient } from 'pg'
import { requireBusinessId } from '@/lib/get-business-id'
import { sendEmail } from '@/lib/email'

/**
 * GET /api/settings/email
 * Devuelve la configuración de email del negocio.
 * Las credenciales SMTP (user/pass) nunca se devuelven — solo flags *_set.
 *
 * PUT /api/settings/email
 * Guarda configuración de email.
 * user y pass solo se escriben si vienen con valor (no vacíos).
 *
 * POST /api/settings/email/test
 * Envía un email de prueba a la dirección indicada.
 */

const PUBLIC_KEYS = [
  'email_enabled',
  'email_smtp_host',
  'email_smtp_port',
  'email_smtp_secure',
  'email_from_name',
  'email_from_address',
  'email_reply_to',
  'email_bcc',
  'email_subject_confirmation',
  'email_intro_confirmation',
  'email_subject_shipment',
  'email_intro_shipment',
] as const

const SECRET_USER = 'email_smtp_user'
const SECRET_PASS = 'email_smtp_pass'

async function upsert(
  client: PoolClient,
  businessId: number,
  key: string,
  value: string,
  isSecret: boolean,
) {
  await client.query(
    `INSERT INTO settings (business_id, key, value, is_secret)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key, business_id)
     DO UPDATE SET value = $3, is_secret = $4`,
    [businessId, key, value, isSecret],
  )
}

export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings
     WHERE business_id = $1
       AND key = ANY($2)`,
    [businessId, [...PUBLIC_KEYS, SECRET_USER, SECRET_PASS]],
  )

  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  return NextResponse.json({
    email_enabled:               map['email_enabled']               ?? 'false',
    email_smtp_host:             map['email_smtp_host']              ?? '',
    email_smtp_port:             map['email_smtp_port']              ?? '587',
    email_smtp_secure:           map['email_smtp_secure']            ?? 'false',
    email_from_name:             map['email_from_name']              ?? '',
    email_from_address:          map['email_from_address']           ?? '',
    email_reply_to:              map['email_reply_to']               ?? '',
    email_bcc:                   map['email_bcc']                    ?? '',
    email_subject_confirmation:  map['email_subject_confirmation']   ?? '',
    email_intro_confirmation:    map['email_intro_confirmation']     ?? '',
    email_subject_shipment:      map['email_subject_shipment']       ?? '',
    email_intro_shipment:        map['email_intro_shipment']         ?? '',
    // Credenciales: nunca devolver el valor, solo si está configurado
    email_smtp_user_set: !!map[SECRET_USER],
    email_smtp_pass_set: !!map[SECRET_PASS],
  })
}

export async function PUT(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    email_enabled?:               string
    email_smtp_host?:             string
    email_smtp_port?:             string
    email_smtp_secure?:           string
    email_from_name?:             string
    email_from_address?:          string
    email_reply_to?:              string
    email_bcc?:                   string | null
    email_subject_confirmation?:  string | null
    email_intro_confirmation?:    string | null
    email_subject_shipment?:      string | null
    email_intro_shipment?:        string | null
    email_smtp_user?:             string | null
    email_smtp_pass?:             string | null
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const pub: Array<[keyof typeof body, string]> = [
      ['email_enabled',               body.email_enabled              ?? 'false'],
      ['email_smtp_host',             body.email_smtp_host             ?? ''],
      ['email_smtp_port',             body.email_smtp_port             ?? '587'],
      ['email_smtp_secure',           body.email_smtp_secure           ?? 'false'],
      ['email_from_name',             body.email_from_name             ?? ''],
      ['email_from_address',          body.email_from_address          ?? ''],
      ['email_reply_to',              body.email_reply_to              ?? ''],
      ['email_bcc',                   body.email_bcc                   ?? ''],
      ['email_subject_confirmation',  body.email_subject_confirmation  ?? ''],
      ['email_intro_confirmation',    body.email_intro_confirmation    ?? ''],
      ['email_subject_shipment',      body.email_subject_shipment      ?? ''],
      ['email_intro_shipment',        body.email_intro_shipment        ?? ''],
    ]

    for (const [key, value] of pub) {
      if (key in body || key === 'email_enabled') {
        await upsert(client, businessId, key, value, false)
      }
    }

    // Secretos: solo escribir si vienen con valor
    if (body.email_smtp_user?.trim()) {
      await upsert(client, businessId, SECRET_USER, body.email_smtp_user.trim(), true)
    }
    if (body.email_smtp_pass?.trim()) {
      await upsert(client, businessId, SECRET_PASS, body.email_smtp_pass.trim(), true)
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PUT /api/settings/email]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}

/**
 * POST /api/settings/email — envía un email de prueba
 * Body: { testTo: string }
 */
export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { testTo } = await req.json() as { testTo?: string }
  if (!testTo?.trim()) {
    return NextResponse.json({ error: 'testTo requerido' }, { status: 400 })
  }

  const emailResult = await sendEmail({
    businessId,
    to:      testTo.trim(),
    subject: '✓ Test email — configuración correcta',
    html:    `
      <div style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 12px;color:#111827;">Email configurado correctamente ✓</h2>
        <p style="margin:0;color:#6b7280;font-size:14px;">
          Si estás viendo esto, tu configuración SMTP está funcionando.<br>
          Los emails transaccionales (confirmación de pedido, envío) se enviarán desde esta cuenta.
        </p>
      </div>`,
    text: 'Email configurado correctamente. Tu configuración SMTP está funcionando.',
  })

  if (!emailResult.ok) {
    return NextResponse.json({ error: emailResult.reason }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
