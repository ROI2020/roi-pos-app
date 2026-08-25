/**
 * lib/mp.ts — MercadoPago SDK (SERVER ONLY)
 *
 * Inicializa el cliente de MP con el Access Token del entorno.
 * Exporta helpers tipados para Checkout Pro.
 *
 * Docs: https://github.com/mercadopago/sdk-nodejs
 */

import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

if (!process.env.MP_ACCESS_TOKEN) {
  throw new Error('MP_ACCESS_TOKEN no está configurado en .env')
}

export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

export const mpPreference = new Preference(mpClient)
export const mpPayment    = new Payment(mpClient)

// ── Tipos helpers ─────────────────────────────────────────────────────────────

export interface MPPreferenceItem {
  id:          string
  title:       string
  quantity:    number
  unit_price:  number
  currency_id: 'ARS'
}

export interface CreatePreferenceParams {
  orderId:      number
  items:        MPPreferenceItem[]
  shippingCost: number          // se agrega como ítem separado si > 0
  payerEmail:   string | null
  payerName:    string
  baseUrl:      string          // NEXT_PUBLIC_BASE_URL
}

/**
 * Crea una Preference de Checkout Pro en MP y devuelve el init_point
 * (URL a la que redirigimos al cliente para que pague).
 */
export async function createCheckoutPreference(p: CreatePreferenceParams): Promise<{
  preferenceId: string
  initPoint:    string
}> {
  const items: MPPreferenceItem[] = [...p.items]

  // El envío va como ítem separado para que figure en el detalle de MP
  if (p.shippingCost > 0) {
    items.push({
      id:         'shipping',
      title:      'Costo de envío',
      quantity:   1,
      unit_price: p.shippingCost,
      currency_id: 'ARS',
    })
  }

  const result = await mpPreference.create({
    body: {
      items: items.map(i => ({
        id:          i.id,
        title:       i.title,
        quantity:    i.quantity,
        unit_price:  i.unit_price,
        currency_id: 'ARS' as const,
      })),
      payer: {
        name:  p.payerName,
        email: p.payerEmail ?? 'cliente@tienda.com',
      },
      back_urls: {
        success: `${p.baseUrl}/tienda/checkout/exito?order=${p.orderId}`,
        failure: `${p.baseUrl}/tienda/checkout/fallo?order=${p.orderId}`,
        pending: `${p.baseUrl}/tienda/checkout/pendiente?order=${p.orderId}`,
      },
      auto_return:         'approved',          // redirige solo si fue aprobado
      external_reference:  String(p.orderId),   // para cruzar en el webhook
      statement_descriptor: 'TIENDA ONLINE',    // texto en el resumen de tarjeta
      notification_url: `${p.baseUrl}/api/webhooks/mp`,
    },
  })

  return {
    preferenceId: result.id!,
    initPoint:    result.init_point!,
  }
}
