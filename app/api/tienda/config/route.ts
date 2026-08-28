import { NextResponse } from 'next/server'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'

/**
 * GET /api/tienda/config
 *
 * Endpoint PÚBLICO — sin autenticación.
 * Devuelve la configuración de la tienda necesaria para el checkout y
 * las páginas de resultado (pago exitoso, pendiente, fallido).
 *
 * Resuelve el negocio desde el dominio del request (mismo mecanismo
 * que /api/catalog y /api/checkout).
 *
 * Responde:
 * {
 *   payment_gateway: 'mercadopago' | 'paypal'
 *   paypal_client_id: string | null   -- público, para PayPalScriptProvider
 *   paypal_mode:      'sandbox' | 'live'
 *   currency:         string           -- 'ARS', 'USD', etc.
 *   locale:           string           -- 'es-AR', 'en-US', etc.
 *   catalog_phone:    string | null    -- WhatsApp del negocio
 * }
 */
export async function GET(req: Request) {
  try {
    const host = req.headers.get('host') ?? 'localhost'
    const businessId = await resolveBusinessFromHost(host)

    const s = await getPublicSettingsByKeys(businessId, [
      'payment_gateway',
      'paypal_client_id',
      'paypal_mode',
      'currency',
      'locale',
      'catalog_phone',
    ])

    return NextResponse.json(
      {
        payment_gateway:  s.payment_gateway  ?? 'mercadopago',
        paypal_client_id: s.paypal_client_id ?? null,
        paypal_mode:      s.paypal_mode      ?? 'sandbox',
        currency:         s.currency         ?? 'ARS',
        locale:           s.locale           ?? 'es-AR',
        catalog_phone:    s.catalog_phone    ?? null,
      },
      // Edge puede cachear 5 min — los settings no cambian con frecuencia
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' } },
    )
  } catch (err) {
    console.error('[GET /api/tienda/config]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
