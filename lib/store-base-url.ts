import { getPublicSettingsByKeys } from '@/lib/settings'
import pool from '@/lib/db'
import { isQa } from '@/lib/env'

export async function getStoreBaseUrl(businessId: number, host: string): Promise<string> {
  if (isQa) {
    const base = process.env.NEXT_PUBLIC_BASE_URL
    if (base) return base.replace(/\/$/, '')
  }

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
