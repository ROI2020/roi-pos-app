import { NextResponse } from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJProductDetail } from '@/lib/cj'

/**
 * GET /api/admin/cj/product?pid=xxxxx
 * Devuelve el detalle completo de un producto CJ (con todas las variantes).
 */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const pid = searchParams.get('pid')?.trim()
  if (!pid) return NextResponse.json({ error: 'pid es requerido' }, { status: 400 })

  // ?raw=1 → devuelve la respuesta cruda de CJ para debug de field names
  const raw = searchParams.get('raw') === '1'

  try {
    const token = await getCJTokenForBusiness(businessId)

    if (raw) {
      // Bypass de tipos: devolver la respuesta tal como la manda CJ
      const { getCJToken: _g, ...rest } = await import('@/lib/cj')
      void rest
      const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1'
      const attempts = [
        () => fetch(`${CJ_BASE}/product/getProductById`, {
          method: 'POST',
          headers: { 'CJ-Access-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid }),
          cache: 'no-store',
        }),
        () => fetch(`${CJ_BASE}/product/getProductById?pid=${pid}`, {
          headers: { 'CJ-Access-Token': token, 'Content-Type': 'application/json' },
          cache: 'no-store',
        }),
      ]
      for (const attempt of attempts) {
        const res  = await attempt()
        const json = await res.json()
        if (json.code === 200) return NextResponse.json(json)
        if (!String(json.message).includes('Interface not found')) {
          return NextResponse.json(json)
        }
      }
      return NextResponse.json({ error: 'All endpoints failed' }, { status: 502 })
    }

    const detail = await getCJProductDetail(token, pid)
    return NextResponse.json(detail)
  } catch (err) {
    console.error('[GET /api/admin/cj/product]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
