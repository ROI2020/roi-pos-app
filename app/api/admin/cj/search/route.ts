import { NextResponse } from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, searchCJProducts } from '@/lib/cj'

/**
 * GET /api/admin/cj/search?q=keyword&page=1&pageSize=20
 * Busca productos en el catálogo de CJ Dropshipping.
 */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q')?.trim()
  const page     = parseInt(searchParams.get('page')     ?? '1',  10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10)

  if (!q) return NextResponse.json({ error: 'q es requerido' }, { status: 400 })

  try {
    const token = await getCJTokenForBusiness(businessId)
    const data  = await searchCJProducts(token, q, page, Math.min(pageSize, 50))
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/admin/cj/search]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
