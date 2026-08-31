import { NextResponse } from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJFreight } from '@/lib/cj'

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1'

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
  const raw  = searchParams.get('raw') === '1'

  if (!vid) return NextResponse.json({ error: 'vid es requerido' }, { status: 400 })

  try {
    const token = await getCJTokenForBusiness(businessId)

    if (raw) {
      // Devuelve la respuesta cruda de CJ para debug
      // Intenta el formato moderno (products array) y el legacy (vid suelto)
      const base = { startCountryCode: from, endCountryCode: to, ...(zip ? { toPostalCode: zip } : {}) }
      const resModern = await fetch(`${CJ_BASE}/logistic/freightCalculate`, {
        method:  'POST',
        headers: { 'CJ-Access-Token': token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...base, products: [{ vid, quantity: Math.max(1, qty) }] }),
        cache: 'no-store',
      })
      const jsonModern = await resModern.json()
      if (jsonModern.code === 200) return NextResponse.json({ _fmt: 'products[]', ...jsonModern })

      const res = await fetch(`${CJ_BASE}/logistic/freightCalculate`, {
        method:  'POST',
        headers: { 'CJ-Access-Token': token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...base, vid, quantity: Math.max(1, qty) }),
        cache: 'no-store',
      })
      return NextResponse.json(await res.json())
    }

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
