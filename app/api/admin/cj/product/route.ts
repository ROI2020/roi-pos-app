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

  try {
    const token  = await getCJTokenForBusiness(businessId)
    const detail = await getCJProductDetail(token, pid)
    return NextResponse.json(detail)
  } catch (err) {
    console.error('[GET /api/admin/cj/product]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
