/**
 * lib/ml-messages.ts — SERVER ONLY
 *
 * Envía mensajes a compradores de MercadoLibre a través de la API de Mensajes.
 * Soporta texto libre y adjunto opcional (PDF de factura, etc.).
 *
 * ML Messages API:
 *   POST /messages/packs/{packId}/sellers/{sellerId}
 *   POST /messages/attachments  (subida de archivo antes de adjuntar)
 */

import { getMLToken, ML_API_BASE } from '@/lib/ml-auth'
import { getPublicSettingsByKeys } from '@/lib/settings'

/** Reemplaza {{variable}} en templates de texto */
export function applyMsgVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/**
 * Sube un archivo a ML y devuelve el attachment_id.
 * Se usa antes de enviar el mensaje para adjuntar el PDF de factura.
 */
async function uploadMLAttachment(
  token:    string,
  filename: string,
  buffer:   Buffer,
  mimeType: string,
): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename)

  const res = await fetch(`${ML_API_BASE}/messages/attachments`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ML /messages/attachments ${res.status}: ${err}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}

export interface SendMLMessageOptions {
  businessId:  number
  packId:      string | number | bigint
  sellerId:    string          // ml_user_id del vendedor
  buyerId:     number | bigint
  text:        string
  /** Si se provee, se adjunta al mensaje */
  attachment?: {
    filename: string
    buffer:   Buffer
    mimeType: string
  }
}

/**
 * Envía un mensaje de ML al comprador de una orden.
 * No lanza — loguea internamente.
 */
export async function sendMLOrderMessage(opts: SendMLMessageOptions): Promise<boolean> {
  const { businessId, packId, sellerId, buyerId, text, attachment } = opts

  try {
    const token = await getMLToken(businessId)

    // 1. Subir adjunto si se proveyó
    let attachmentId: string | null = null
    if (attachment) {
      try {
        attachmentId = await uploadMLAttachment(token, attachment.filename, attachment.buffer, attachment.mimeType)
      } catch (e) {
        console.warn(`[ml-messages] No se pudo subir adjunto: ${e}`)
        // Continúa sin el adjunto
      }
    }

    // 2. Armar body del mensaje
    const body: Record<string, unknown> = {
      from: { user_id: parseInt(sellerId) },
      to:   [{ user_id: Number(buyerId) }],
      text,
    }
    if (attachmentId) {
      body.attachments = [{ id: attachmentId }]
    }

    // 3. Enviar mensaje
    const res = await fetch(
      `${ML_API_BASE}/messages/packs/${packId}/sellers/${sellerId}`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`ML /messages/packs ${res.status}: ${err}`)
    }

    return true

  } catch (err) {
    console.error('[ml-messages] Error enviando mensaje:', err)
    return false
  }
}

/**
 * Arma y envía el mensaje de confirmación de orden ML.
 * Usa el template 'ml_msg_confirmation' de settings.
 * Default: "Hola {{buyerNickname}}, recibimos tu pedido. Lo estamos preparando 🙌"
 */
export async function sendMLConfirmation(
  businessId:    number,
  packId:        string | number | bigint,
  sellerId:      string,
  buyerId:       number | bigint,
  buyerNickname: string,
): Promise<boolean> {
  const settings = await getPublicSettingsByKeys(businessId, ['ml_msg_confirmation', 'business_name'])
  const storeName = settings.business_name ?? 'La tienda'

  const template = settings.ml_msg_confirmation?.trim()
    || '¡Hola {{buyerNickname}}! Recibimos tu pedido en {{storeName}} y ya lo estamos preparando 🙌. Ante cualquier consulta, escribinos acá.'

  const text = applyMsgVars(template, { buyerNickname, storeName })

  return sendMLOrderMessage({ businessId, packId, sellerId, buyerId, text })
}

/**
 * Arma y envía el mensaje de despacho con tracking.
 * Usa el template 'ml_msg_dispatched' de settings.
 * Adjunta PDF de factura si se provee.
 */
export async function sendMLDispatched(
  businessId:    number,
  packId:        string | number | bigint,
  sellerId:      string,
  buyerId:       number | bigint,
  buyerNickname: string,
  trackingNumber: string,
  carrier:       string,
  invoicePdf?:   Buffer,
): Promise<boolean> {
  const settings = await getPublicSettingsByKeys(businessId, ['ml_msg_dispatched', 'business_name'])
  const storeName = settings.business_name ?? 'La tienda'

  const template = settings.ml_msg_dispatched?.trim()
    || '¡Hola {{buyerNickname}}! Tu pedido ya fue despachado por {{carrier}} 📦. Número de seguimiento: {{trackingNumber}}. Podés rastrearlo en el sitio del correo. ¡Gracias por tu compra!'

  const text = applyMsgVars(template, { buyerNickname, storeName, trackingNumber, carrier })

  const attachment = invoicePdf
    ? { filename: 'factura.pdf', buffer: invoicePdf, mimeType: 'application/pdf' }
    : undefined

  return sendMLOrderMessage({ businessId, packId, sellerId, buyerId, text, attachment })
}
