import { NextResponse } from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJFreight } from '@/lib/cj'

/**
 * GET /api/admin/cj/freight
 *
 * Calcula los costos de envío disponibles para un producto CJ.
 *
 * Parámetros:
 *   vid         string   CJ Variant ID (se usa el primer vid del producto)
 *   qty         number   Cantidad (default 1)
 *   from        string   Almacén origen: 'US' | 'CN' (default 'CN')
 *   to          string   País destino: 'US' | 'AR' | etc. (default 'US')
 *   zip         string   Código postal destino (opcional, mejora precisión)
 *
 * Responde con:
 * [
 *   {
 *     logisticName:    "CJPacket Ordinary"
 *     freight:         0          // USD
 *     isFree:          true
 *     minDeliveryDays: 7
 *     maxDeliveryDays: 15
 *   },
 *   ...
 * ]
 */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const vid  = searchParams.get('vid')?.trim()
  const qty  = parseInt(searchParams.get('qty') ?? '1', 10)
  const from = searchParams.get('from')?.trim() || 'CN'
  const to   = searchParams.get('to')?.trim()   || 'US'
  const zip  = searchParams.get('zip')?.trim()  || undefined

  if (!vid) return NextResponse.json({ error: 'vid es requerido' }, { status: 400 })

  try {
    const token   = await getCJTokenForBusiness(businessId)
    const freight = await getCJFreight(token, {
      vid,
      quantity:         Math.max(1, qty),
      startCountryCode: from,
      endCountryCode:   to,
      toPostalCode:     zip,
    })
    return NextResponse.json(freight)
  } catch (err) {
    console.error('[GET /api/admin/cj/freight]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
