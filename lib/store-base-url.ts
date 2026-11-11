import { getPublicSettingsByKeys } from '@/lib/settings'
import pool from '@/lib/db'

/**
 * Resuelve la URL base canónica de la tienda en orden de prioridad:
 * 1. catalog_base_url en settings (override manual)
 * 2. Dominio primario de business_domains (is_primary = true)
 * 3. Fallback al host del request
 *
 * Retorna siempre sin barra final.
 */
export async function getStoreBaseUrl(businessId: number, host: string): Promise<string> {
  try {
    const s = await getPublicSettingsByKeys(businessId, ['catalog_base_url'])
    const url = s['catalog_base_url']
    if (url) return url.replace(/\/$/, '')
  } catch { /* continue */ }

  try {
    const { rows } = await pool.query<{ domain: string }>(
      `SELECT domain FROM business_domains
       WHERE business_id = $1 AND is_primary = true
       LIMIT 1`,
      [businessId],
    )
    if (rows[0]?.domain) return `https://${rows[0].domain}`
  } catch { /* continue */ }

  const cleanHost = host.replace(/^www\./, '').replace(/:\d+$/, '')
  return `https://${cleanHost}`
}
