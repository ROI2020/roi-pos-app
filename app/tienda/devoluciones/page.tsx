import { permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'

export default async function DevolucionesRedirect() {
  const h         = await headers()
  const host      = h.get('host') ?? 'localhost'
  const storeBase = h.get('x-store-base') ?? '/tienda'

  let slug = 'devoluciones'
  try {
    const businessId = await resolveBusinessFromHost(host)
    const s = await getPublicSettingsByKeys(businessId, ['locale'])
    if ((s['locale'] ?? 'es-AR').startsWith('en')) slug = 'returns'
  } catch { /* use 'devoluciones' */ }

  permanentRedirect(`${storeBase}/p/${slug}`)
}
