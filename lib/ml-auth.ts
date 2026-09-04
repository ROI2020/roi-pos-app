/**
 * lib/ml-auth.ts — SERVER ONLY
 *
 * Gestión de tokens OAuth 2.0 para MercadoLibre, por negocio.
 *
 * ML usa tokens de corta duración:
 *   access_token  → vence en ~6 horas
 *   refresh_token → vence en ~6 meses
 *
 * Todos los tokens/credenciales se guardan en la tabla `settings`:
 *   ml_app_id        (public)  — App ID de la aplicación ML
 *   ml_app_secret    (secret)  — Secret Key
 *   ml_access_token  (secret)  — token activo
 *   ml_refresh_token (secret)  — token de refresco
 *   ml_token_expires (public)  — ISO timestamp de vencimiento
 *   ml_user_id       (public)  — ID del vendedor en ML
 *
 * Flujo OAuth inicial (una sola vez por negocio):
 *   1. Admin abre /api/ml/auth/start?businessId=X
 *   2. Redirige a ML con el App ID del negocio
 *   3. ML redirige a /api/ml/auth/callback?code=XXX&state=X
 *   4. El callback intercambia el code por tokens y los guarda en settings
 */

import pool from '@/lib/db'
import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'

// ── URLs de la API de ML ──────────────────────────────────────────────────────

export const ML_API_BASE = 'https://api.mercadolibre.com'
export const ML_AUTH_URL = 'https://auth.mercadolibre.com.ar/authorization'
export const ML_TOKEN_URL = `${ML_API_BASE}/oauth/token`

// Cuántos minutos antes del vencimiento refrescar el token (margen de seguridad)
const REFRESH_MARGIN_MS = 10 * 60 * 1000 // 10 minutos

// ── Helper interno: upsert setting ───────────────────────────────────────────

async function upsertSetting(
  businessId: number,
  key: string,
  value: string,
  isSecret: boolean,
) {
  await pool.query(
    `INSERT INTO settings (business_id, key, value, is_secret)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key, business_id)
     DO UPDATE SET value = $3, is_secret = $4`,
    [businessId, key, value, isSecret],
  )
}

// ── Credenciales de la app ML para un negocio ────────────────────────────────

export interface MLAppCredentials {
  appId:     string
  appSecret: string
}

export async function getMLAppCredentials(businessId: number): Promise<MLAppCredentials> {
  const pub = await getPublicSettingsByKeys(businessId, ['ml_app_id'])
  const appId     = pub.ml_app_id?.trim()
  const appSecret = await getSecretSetting(businessId, 'ml_app_secret')

  if (!appId || !appSecret) {
    throw new Error(
      `MercadoLibre: credenciales de app no configuradas para business_id=${businessId}. ` +
      'Configurá ml_app_id y ml_app_secret en Admin → Configuración → MercadoLibre.',
    )
  }
  return { appId, appSecret }
}

// ── Token management ─────────────────────────────────────────────────────────

interface TokenData {
  accessToken:  string
  refreshToken: string
  expiresAt:    Date
  userId:       string
}

/**
 * Obtiene un access_token válido para el negocio.
 * Si el token está por vencer, lo refresca automáticamente.
 * Lanza si no hay tokens guardados (OAuth inicial no completado).
 */
export async function getMLToken(businessId: number): Promise<string> {
  const pub = await getPublicSettingsByKeys(businessId, ['ml_token_expires', 'ml_user_id'])
  const accessToken  = await getSecretSetting(businessId, 'ml_access_token')
  const refreshToken = await getSecretSetting(businessId, 'ml_refresh_token')

  if (!accessToken || !refreshToken) {
    throw new Error(
      `MercadoLibre: no hay tokens para business_id=${businessId}. ` +
      'Completá el flujo OAuth en Admin → Configuración → MercadoLibre.',
    )
  }

  // Verificar si el token vence pronto
  const expiresAt = pub.ml_token_expires ? new Date(pub.ml_token_expires) : null
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now()) < REFRESH_MARGIN_MS

  if (!needsRefresh) return accessToken

  // Refrescar el token
  console.info(`[ml-auth] Refrescando token para business_id=${businessId}`)
  const tokens = await refreshMLToken(businessId, refreshToken)
  return tokens.accessToken
}

/**
 * Intercambia un authorization_code por tokens (OAuth inicial).
 * Guarda los tokens en settings del negocio.
 */
export async function exchangeCodeForTokens(
  businessId: number,
  code:        string,
  redirectUri: string,
): Promise<TokenData> {
  const { appId, appSecret } = await getMLAppCredentials(businessId)

  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    client_id:    appId,
    client_secret: appSecret,
    code,
    redirect_uri: redirectUri,
  })

  const res = await fetch(ML_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ML OAuth token exchange failed: ${err}`)
  }

  const data = await res.json() as {
    access_token:  string
    refresh_token: string
    expires_in:    number   // segundos
    user_id:       number
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  const tokens: TokenData = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    userId:       String(data.user_id),
  }

  await saveTokens(businessId, tokens)
  console.info(`[ml-auth] Tokens guardados para business_id=${businessId}, user_id=${tokens.userId}`)
  return tokens
}

/**
 * Refresca el access_token usando el refresh_token.
 * Guarda los nuevos tokens en settings.
 */
async function refreshMLToken(businessId: number, refreshToken: string): Promise<TokenData> {
  const { appId, appSecret } = await getMLAppCredentials(businessId)

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     appId,
    client_secret: appSecret,
    refresh_token: refreshToken,
  })

  const res = await fetch(ML_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ML token refresh failed: ${err}`)
  }

  const data = await res.json() as {
    access_token:  string
    refresh_token: string
    expires_in:    number
    user_id:       number
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  const tokens: TokenData = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    userId:       String(data.user_id),
  }

  await saveTokens(businessId, tokens)
  return tokens
}

/**
 * Guarda los tokens en la tabla settings del negocio.
 */
async function saveTokens(businessId: number, tokens: TokenData): Promise<void> {
  await Promise.all([
    upsertSetting(businessId, 'ml_access_token',  tokens.accessToken,             true),
    upsertSetting(businessId, 'ml_refresh_token', tokens.refreshToken,            true),
    upsertSetting(businessId, 'ml_token_expires', tokens.expiresAt.toISOString(), false),
    upsertSetting(businessId, 'ml_user_id',       tokens.userId,                  false),
  ])
}

/**
 * Construye la URL de autorización de ML para el OAuth inicial.
 */
export function buildMLAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     appId,
    redirect_uri:  redirectUri,
    state,
  })
  return `${ML_AUTH_URL}?${params.toString()}`
}
