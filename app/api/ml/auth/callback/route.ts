/**
 * GET /api/ml/auth/callback?code=XXX&state=businessId
 *
 * Callback OAuth de MercadoLibre.
 * ML redirige aquí después de que el admin autoriza la app.
 *
 * - Intercambia el code por access_token + refresh_token
 * - Guarda los tokens en settings del negocio (is_secret = true)
 * - Redirige al panel de configuración con mensaje de éxito/error
 */

import { NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/ml-auth'
import pool from '@/lib/db'

export async function GET(req: Request) {
  const url   = new URL(req.url)
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')   // businessId
  const error = url.searchParams.get('error')   // si el usuario cancela

  const adminBase = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
  const settingsUrl = `${adminBase}/configuracion?tab=ml`

  // ── Usuario canceló la autorización ──────────────────────────────────────
  if (error) {
    console.warn(`[ml/auth/callback] Usuario canceló OAuth: ${error}`)
    return NextResponse.redirect(`${settingsUrl}&ml_status=cancelled`)
  }

  // ── Validar parámetros ────────────────────────────────────────────────────
  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}&ml_status=error&ml_msg=invalid_callback`)
  }

  const businessId = parseInt(state)
  if (isNaN(businessId)) {
    return NextResponse.redirect(`${settingsUrl}&ml_status=error&ml_msg=invalid_state`)
  }

  try {
    const baseUrl     = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? ''
    const redirectUri = `${baseUrl}/api/ml/auth/callback`

    const tokens = await exchangeCodeForTokens(businessId, code, redirectUri)

    // Marcar ML como habilitado para el negocio
    await pool.query(
      `INSERT INTO settings (business_id, key, value, is_secret)
       VALUES ($1, 'ml_enabled', 'true', false)
       ON CONFLICT (key, business_id) DO UPDATE SET value = 'true'`,
      [businessId],
    )

    console.info(`[ml/auth/callback] OAuth completado para business_id=${businessId}, user_id=${tokens.userId}`)
    return NextResponse.redirect(`${settingsUrl}&ml_status=connected`)

  } catch (err) {
    console.error('[ml/auth/callback]', err)
    const msg = encodeURIComponent(String(err).slice(0, 200))
    return NextResponse.redirect(`${settingsUrl}&ml_status=error&ml_msg=${msg}`)
  }
}
