/**
 * lib/mp.ts — MercadoPago SDK (SERVER ONLY)
 *
 * Dos modos de uso:
 *
 * 1. PER-BUSINESS (checkout): getMPClientForBusiness(businessId)
 *    Lee mp_access_token de la tabla settings del negocio.
 *    Fallback al env var MP_ACCESS_TOKEN si la clave no está configurada aún.
 *    Usar para createCheckoutPreference().
 *
 * 2. GLOBAL (webhook): mpPayment (exportado)
 *    Basado en MP_ACCESS_TOKEN env var.
 *    Usado por /api/webhooks/mp hasta migrar a URLs de webhook por negocio.
 *    Puede ser null si MP_ACCESS_TOKEN no está definido (ej: deploy sin MP).
 *
 * TODO (Fase 5+): migrar el webhook a /api/webhooks/mp/[businessId] para
 * que cada negocio tenga su propio endpoint y cliente. En ese caso mpPayment
 * global ya no será necesario.
 *
 * Docs: https://github.com/mercadopago/sdk-nodejs
 */

import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { getSecretSetting } from '@/lib/settings'

// ── Cliente global (env var) — solo para el webhook ──────────────────────────
// No lanzar error a nivel de módulo: en negocios que no usan MP (ej: USA/PayPal)
// MP_ACCESS_TOKEN puede no estar definido y está bien.
const _globalMPToken = process.env.MP_ACCESS_TOKEN ?? null

const _globalClient = _globalMPToken
  ? new MercadoPagoConfig({ accessToken: _globalMPToken })
  : null

/**
 * Cliente de pagos global (env var).
 * Solo para uso en el webhook. Puede ser null si MP no está configurado.
 */
export const mpPayment: Payment | null = _globalClient
  ? new Payment(_globalClient)
  : null

// ── Tipos helpers ─────────────────────────────────────────────────────────────

export interface MPPreferenceItem {
  id:          string
  title:       string
  quantity:    number
  unit_price:  number
  currency_id: string   // 'ARS', 'USD', etc. — depende del negocio
}

export interface CreatePreferenceParams {
  businessId:   number
  orderId:      number
  items:        MPPreferenceItem[]
  shippingCost: number          // se agrega como ítem separado si > 0
  payerEmail:   string | null
  payerName:    string
  baseUrl:      string          // NEXT_PUBLIC_BASE_URL
  currency:     string          // 'ARS' | 'USD' — leído de settings del negocio
}

// ── Factory per-business ──────────────────────────────────────────────────────

/**
 * Crea un cliente MP con las credenciales del negocio.
 * Lee mp_access_token de settings (is_secret=true).
 * Fallback al env var MP_ACCESS_TOKEN para desarrollo.
 *
 * Lanza si no hay ningún token disponible.
 */
export async function getMPClientForBusiness(businessId: number): Promise<{
  preference: Preference
  payment:    Payment
}> {
  const tokenFromDB = await getSecretSetting(businessId, 'mp_access_token')
  const accessToken = tokenFromDB?.trim() || _globalMPToken

  if (!accessToken) {
    throw new Error(
      `MercadoPago: sin access token para business_id=${businessId}. ` +
      'Configuralo en Admin → Configuración → Pagos, ' +
      'o define MP_ACCESS_TOKEN en .env para desarrollo.'
    )
  }

  const client = new MercadoPagoConfig({ accessToken })
  return {
    preference: new Preference(client),
    payment:    new Payment(client),
  }
}

// ── Helper checkout ───────────────────────────────────────────────────────────

/**
 * Crea una Preference de Checkout Pro en MercadoPago usando las credenciales
 * del negocio (leídas de settings). Devuelve preferenceId e initPoint.
 */
export async function createCheckoutPreference(
  p: CreatePreferenceParams
): Promise<{ preferenceId: string; initPoint: string }> {
  const { preference } = await getMPClientForBusiness(p.businessId)

  const items: MPPreferenceItem[] = [...p.items]

  // El envío va como ítem separado para que figure en el detalle de MP
  if (p.shippingCost > 0) {
    items.push({
      id:          'shipping',
      title:       'Costo de envío',
      quantity:    1,
      unit_price:  p.shippingCost,
      currency_id: p.currency,
    })
  }

  const result = await preference.create({
    body: {
      items: items.map(i => ({
        id:          i.id,
        title:       i.title,
        quantity:    i.quantity,
        unit_price:  i.unit_price,
        currency_id: i.currency_id,
      })),
      payer: {
        name:  p.payerName,
        email: p.payerEmail ?? 'cliente@tienda.com',
      },
      back_urls: {
        success: `${p.baseUrl}/tienda/checkout/success?orderId=${p.orderId}`,
        failure: `${p.baseUrl}/tienda/checkout/failure?orderId=${p.orderId}`,
        pending: `${p.baseUrl}/tienda/checkout/pending?orderId=${p.orderId}`,
      },
      auto_return:         'approved',
      external_reference:  String(p.orderId),
      statement_descriptor: 'TIENDA ONLINE',
      notification_url:    `${p.baseUrl}/api/webhooks/mp`,
    },
  })

  return {
    preferenceId: result.id!,
    initPoint:    result.init_point!,
  }
}
