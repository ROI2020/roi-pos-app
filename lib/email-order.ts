/**
 * lib/email-order.ts
 *
 * Helpers de alto nivel para enviar emails de pedidos.
 * Cargan los datos necesarios desde la DB y llaman a sendEmail.
 *
 * Dos funciones exportadas:
 *   sendOrderConfirmation(orderId)  — confirmación de pago
 *   sendShipmentNotification(orderId) — pedido enviado
 *
 * Ambas son non-blocking: nunca lanzan, loguean internamente.
 */

import pool from '@/lib/db'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { sendEmail } from '@/lib/email'
import {
  orderConfirmationHtml,
  orderConfirmationText,
  shipmentNotificationHtml,
  shipmentNotificationText,
} from '@/lib/email-templates'

// ── Utilidades ────────────────────────────────────────────────────────────────

interface OrderBase {
  id:           number
  business_id:  number
  buyer_name:   string
  buyer_email:  string | null
  delivery_type: string
  subtotal:     number
  shipping_cost: number
  total:        number
  created_at:   string
}

interface OrderItem {
  product_name:  string
  variant_color: string
  variant_size:  string
  unit_price:    number
}

async function loadOrderBase(orderId: number): Promise<OrderBase | null> {
  const { rows } = await pool.query<OrderBase>(
    `SELECT id, business_id, buyer_name, buyer_email, delivery_type,
            subtotal::float, shipping_cost::float, total::float, created_at
     FROM online_orders WHERE id = $1`,
    [orderId],
  )
  return rows[0] ?? null
}

async function loadOrderItems(orderId: number): Promise<OrderItem[]> {
  const { rows } = await pool.query<OrderItem>(
    `SELECT product_name, variant_color, variant_size, unit_price::float
     FROM online_order_items WHERE online_order_id = $1 ORDER BY id`,
    [orderId],
  )
  return rows
}

async function loadStoreSettings(businessId: number) {
  return getPublicSettingsByKeys(businessId, [
    'business_name',
    'catalog_base_url',
    'catalog_color_primary',
    'email_subject_confirmation',
    'email_intro_confirmation',
    'email_subject_shipment',
    'email_intro_shipment',
  ])
}

/**
 * Reemplaza {{variable}} en un template de texto.
 * Variables soportadas: {{buyerName}}, {{orderId}}, {{storeName}}
 */
function applyVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ── Confirmación de pedido ────────────────────────────────────────────────────

/**
 * Envía el email de confirmación de pedido al comprador.
 * Llamar después de aprobar el pago (PayPal capture, MP webhook).
 * No lanza — loguea internamente.
 */
export async function sendOrderConfirmation(orderId: number): Promise<void> {
  try {
    const order = await loadOrderBase(orderId)
    if (!order) {
      console.warn(`[email-order] Pedido #${orderId} no encontrado`)
      return
    }

    if (!order.buyer_email) {
      console.info(`[email-order] Pedido #${orderId} sin email de comprador — omitido`)
      return
    }

    const [items, settings] = await Promise.all([
      loadOrderItems(orderId),
      loadStoreSettings(order.business_id),
    ])

    const storeName   = settings.business_name    || 'Your store'
    const storeUrl    = (settings.catalog_base_url || '').replace(/\/$/, '')
    const accentColor = settings.catalog_color_primary || '#7c3aed'

    const tplVars = { buyerName: order.buyer_name, orderId: String(order.id), storeName }

    // Subject: usa el de settings si está configurado, si no el default
    const subject = settings.email_subject_confirmation?.trim()
      ? applyVars(settings.email_subject_confirmation, tplVars)
      : `Order #${order.id} confirmed — ${storeName}`

    // Intro: usa el de settings si está configurado, si no undefined (usa el default del template)
    const customIntro = settings.email_intro_confirmation?.trim()
      ? applyVars(settings.email_intro_confirmation, tplVars)
      : undefined

    const result = await sendEmail({
      businessId: order.business_id,
      to:         order.buyer_email,
      subject,
      html: orderConfirmationHtml({
        storeName,
        accentColor,
        storeUrl,
        orderId:      order.id,
        buyerName:    order.buyer_name,
        createdAt:    order.created_at,
        items,
        subtotal:     order.subtotal,
        shippingCost: order.shipping_cost,
        total:        order.total,
        deliveryType: order.delivery_type,
        customIntro,
      }),
      text: orderConfirmationText({
        storeName, accentColor, storeUrl,
        orderId: order.id, buyerName: order.buyer_name,
        createdAt: order.created_at, items,
        subtotal: order.subtotal, shippingCost: order.shipping_cost,
        total: order.total, deliveryType: order.delivery_type,
        customIntro,
      }),
    })

    if (!result.ok && result.reason !== 'email_disabled') {
      console.warn(`[email-order] Confirmación #${orderId}: ${result.reason}`)
    }
  } catch (err) {
    console.error(`[email-order] Error en confirmación #${orderId}:`, err)
  }
}

// ── Notificación de envío ─────────────────────────────────────────────────────

/**
 * Envía el email de notificación de envío al comprador.
 * Llamar cuando el tracking number queda registrado por primera vez.
 * No lanza — loguea internamente.
 */
export async function sendShipmentNotification(
  orderId:        number,
  carrier:        string | null,
  trackingNumber: string | null,
): Promise<void> {
  try {
    const order = await loadOrderBase(orderId)
    if (!order) {
      console.warn(`[email-order] Pedido #${orderId} no encontrado`)
      return
    }

    if (!order.buyer_email) {
      console.info(`[email-order] Pedido #${orderId} sin email de comprador — omitido`)
      return
    }

    const settings = await loadStoreSettings(order.business_id)

    const storeName   = settings.business_name    || 'Your store'
    const storeUrl    = (settings.catalog_base_url || '').replace(/\/$/, '')
    const accentColor = settings.catalog_color_primary || '#7c3aed'

    const tplVars = { buyerName: order.buyer_name, orderId: String(order.id), storeName }

    const subject = settings.email_subject_shipment?.trim()
      ? applyVars(settings.email_subject_shipment, tplVars)
      : `Your order #${order.id} has shipped! — ${storeName}`

    const customIntro = settings.email_intro_shipment?.trim()
      ? applyVars(settings.email_intro_shipment, tplVars)
      : undefined

    const result = await sendEmail({
      businessId: order.business_id,
      to:         order.buyer_email,
      subject,
      html: shipmentNotificationHtml({
        storeName, accentColor, storeUrl,
        orderId: order.id, buyerName: order.buyer_name,
        carrier, trackingNumber, customIntro,
      }),
      text: shipmentNotificationText({
        storeName, accentColor, storeUrl,
        orderId: order.id, buyerName: order.buyer_name,
        carrier, trackingNumber, customIntro,
      }),
    })

    if (!result.ok && result.reason !== 'email_disabled') {
      console.warn(`[email-order] Envío #${orderId}: ${result.reason}`)
    }
  } catch (err) {
    console.error(`[email-order] Error en notificación envío #${orderId}:`, err)
  }
}
