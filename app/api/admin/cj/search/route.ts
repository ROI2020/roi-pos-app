import { NextResponse } from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, searchCJProducts } from '@/lib/cj'

/**
 * GET /api/admin/cj/search
 *
 * Parámetros:
 *   q           string   Búsqueda por nombre
 *   page        number   Página (default 1)
 *   pageSize    number   Resultados por página (max 50, default 20)
 *   warehouse   'US'|'CN'|''  Filtrar por almacén (vacío = todos)
 *   inStock     '1'      Solo productos con stock disponible
 *   minPrice    number   Precio mínimo CJ (USD)
 *   maxPrice    number   Precio máximo CJ (USD)
 */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q')?.trim()
  const page     = parseInt(searchParams.get('page')     ?? '1',  10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10)
  const warehouse = searchParams.get('warehouse')?.trim()   // 'US'|'CN'|''
  const inStock   = searchParams.get('inStock') === '1'
  const minPrice  = searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined
  const maxPrice  = searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined

  if (!q) return NextResponse.json({ error: 'q es requerido' }, { status: 400 })

  try {
    const token = await getCJTokenForBusiness(businessId)
    const data  = await searchCJProducts(token, {
      keyword:      q,
      page,
      pageSize:     Math.min(pageSize, 50),
      countryCode:  warehouse || undefined,
      hasInventory: inStock   || undefined,
      minPrice,
      maxPrice,
    })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/admin/cj/search]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
