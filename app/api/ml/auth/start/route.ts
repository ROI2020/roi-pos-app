/**
 * GET /api/ml/auth/start
 *
 * Inicia el flujo OAuth de MercadoLibre para el negocio del admin logueado.
 * Redirige al admin a la página de autorización de ML.
 *
 * Prerequisitos (configurar en settings del negocio):
 *   ml_app_id     → App ID obtenido en developers.mercadolibre.com.ar
 *   ml_app_secret → Secret Key (is_secret = true)
 *
 * El redirect_uri registrado en la app ML debe ser exactamente:
 *   {NEXT_PUBLIC_BASE_URL}/api/ml/auth/callback
 */

import { NextResponse } from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { buildMLAuthUrl } from '@/lib/ml-auth'

export async function GET() {
  try {
    const result = await requireBusinessId()
    if (result instanceof NextResponse) return result
    const { businessId } = result

    // Leer App ID del negocio desde settings
    const pub   = await getPublicSettingsByKeys(businessId, ['ml_app_id'])
    const appId = pub.ml_app_id?.trim()
    if (!appId) {
      return NextResponse.json(
        { error: 'ml_app_id no configurado. Cargá el App ID de tu aplicación ML en Configuración → MercadoLibre.' },
        { status: 400 },
      )
    }

    const baseUrl     = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
    const redirectUri = `${baseUrl}/api/ml/auth/callback`

    // state = businessId para recuperarlo en el callback
    const authUrl = buildMLAuthUrl(appId, redirectUri, String(businessId))

    return NextResponse.redirect(authUrl)
  } catch (err) {
    console.error('[ml/auth/start]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
