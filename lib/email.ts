/**
 * lib/email.ts — SERVER ONLY
 *
 * Envío de emails transaccionales via SMTP (Nodemailer).
 * Las credenciales se leen desde la tabla settings del negocio.
 *
 * Settings públicos:
 *   email_enabled       'true' | 'false'
 *   email_smtp_host     'smtp.gmail.com'
 *   email_smtp_port     '587'
 *   email_smtp_secure   'false' (STARTTLS) | 'true' (SSL directo)
 *   email_from_name     'Mi Tienda'
 *   email_from_address  'pedidos@mitienda.com'
 *   email_reply_to      (opcional)
 *
 * Settings secretos:
 *   email_smtp_user     usuario SMTP (generalmente = from_address)
 *   email_smtp_pass     contraseña o App Password
 */

import nodemailer from 'nodemailer'
import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'

export interface SendEmailOptions {
  businessId:  number
  to:          string
  subject:     string
  html:        string
  text?:       string
  /** Si se pasa, anula el email_bcc de settings para este envío */
  bcc?:        string
}

/**
 * Envía un email para el negocio dado.
 * Retorna { ok: true } o { ok: false, reason: string }.
 * Nunca lanza — los errores se loguean y se devuelven en el result.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; reason?: string }> {
  try {
    const pub = await getPublicSettingsByKeys(opts.businessId, [
      'email_enabled',
      'email_smtp_host',
      'email_smtp_port',
      'email_smtp_secure',
      'email_from_name',
      'email_from_address',
      'email_reply_to',
      'email_bcc',
    ])

    if (pub.email_enabled !== 'true') {
      return { ok: false, reason: 'email_disabled' }
    }

    const host    = pub.email_smtp_host?.trim()
    const fromAddr = pub.email_from_address?.trim()

    if (!host || !fromAddr) {
      return { ok: false, reason: 'smtp_not_configured' }
    }

    const smtpUser = await getSecretSetting(opts.businessId, 'email_smtp_user')
    const smtpPass = await getSecretSetting(opts.businessId, 'email_smtp_pass')

    if (!smtpUser || !smtpPass) {
      return { ok: false, reason: 'smtp_credentials_missing' }
    }

    const port   = parseInt(pub.email_smtp_port ?? '587')
    const secure = pub.email_smtp_secure === 'true'

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    })

    const fromName = pub.email_from_name?.trim() || fromAddr
    const replyTo  = pub.email_reply_to?.trim() || undefined
    // BCC: el caller puede pasar uno explícito; si no, usa el de settings
    const bcc      = opts.bcc?.trim() || pub.email_bcc?.trim() || undefined

    await transporter.sendMail({
      from:     `"${fromName}" <${fromAddr}>`,
      to:       opts.to,
      replyTo,
      bcc,
      subject:  opts.subject,
      html:     opts.html,
      text:     opts.text,
    })

    console.info(`[email] Enviado a ${opts.to} — "${opts.subject}"`)
    return { ok: true }

  } catch (err) {
    console.error('[email] Error al enviar:', err)
    return { ok: false, reason: String(err) }
  }
}
