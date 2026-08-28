/**
 * lib/settings.ts — SERVER ONLY
 *
 * Utilidades para leer settings de negocio desde la DB.
 *
 * REGLAS DE SEGURIDAD:
 *  - getPublicSettings / getPublicSettingsByKeys → solo claves con is_secret=false.
 *    Seguras para incluir en respuestas de API al cliente.
 *  - getSecretSetting → lee una clave is_secret=true.
 *    ⚠️  NUNCA incluir el valor en respuestas al cliente.
 *    Solo usar dentro de rutas server-side (API routes, lib/).
 */

import pool from '@/lib/db'

export type SettingsMap = Record<string, string | null>

/**
 * Lee TODOS los settings públicos (is_secret = false) de un negocio.
 */
export async function getPublicSettings(businessId: number): Promise<SettingsMap> {
  const { rows } = await pool.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings
     WHERE business_id = $1 AND is_secret = false`,
    [businessId]
  )
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

/**
 * Lee un subconjunto de settings públicos filtrando por clave.
 * Más eficiente que getPublicSettings cuando solo se necesitan algunas claves.
 */
export async function getPublicSettingsByKeys(
  businessId: number,
  keys: string[]
): Promise<SettingsMap> {
  const { rows } = await pool.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings
     WHERE business_id = $1
       AND key = ANY($2::text[])
       AND is_secret = false`,
    [businessId, keys]
  )
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

/**
 * Lee UN setting secreto (is_secret = true) por clave.
 *
 * ⚠️  NUNCA devolver este valor al cliente.
 * Usar solo en API routes server-side o en lib/ para inicializar SDKs.
 */
export async function getSecretSetting(
  businessId: number,
  key: string
): Promise<string | null> {
  const { rows } = await pool.query<{ value: string | null }>(
    `SELECT value FROM settings
     WHERE business_id = $1 AND key = $2 AND is_secret = true`,
    [businessId, key]
  )
  return rows[0]?.value ?? null
}
