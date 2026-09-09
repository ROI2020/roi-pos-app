/**
 * GET /api/ml/size-guides?itemId=MLA_ID_PROPIO
 *
 * (A) Lee un ítem propio del vendedor para extraer SIZE_GRID_ID
 * (B) Prueba el endpoint del dominio para encontrar grids de talles
 * (C) Lee ítems publicados por este vendedor para encontrar uno en MLA109085
 */

import { NextResponse }      from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { mlFetch }           from '@/lib/ml-service'

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url    = new URL(req.url)
  const itemId = url.searchParams.get('itemId')
  const out: Record<string, unknown> = {}

  // ── A. Si se pasa un itemId propio, leerlo con auth ───────────────────────────
  if (itemId) {
    try {
      const item = await mlFetch<{
        id:                  string
        title:               string
        family_name?:        string
        catalog_product_id?: string
        attributes:          Array<{ id: string; value_id?: string; value_name?: string }>
        variations:          Array<{
          id: number
          attributes: Array<{ id: string; value_id?: string; value_name?: string }>
        }>
      }>(businessId, `/items/${itemId}?include_attributes=all`)

      const sizeGridId = item.attributes?.find(a => a.id === 'SIZE_GRID_ID')
      out.item = {
        id:              item.id,
        title:           item.title,
        familyName:      item.family_name,
        catalogProductId: item.catalog_product_id,
        SIZE_GRID_ID:    sizeGridId ?? 'no encontrado',
        allAttributes:   item.attributes,
      }
    } catch (e) {
      out.itemError = String(e).slice(0, 300)
    }
    return NextResponse.json(out)
  }

  // ── B. Items publicados por este vendedor ─────────────────────────────────────
  try {
    const user = await mlFetch<{ id: number }>(businessId, '/users/me')
    const mlUserId = user.id

    const myItems = await mlFetch<{
      results: string[]
      paging:  { total: number }
    }>(businessId, `/users/${mlUserId}/items/search?category=MLA109085&limit=5`)

    out.myItemsInCategory = myItems
    out.myItemsTotal      = myItems.paging?.total ?? 0

    // Si hay ítems propios en esta categoría, leer el primero
    if (myItems.results?.length > 0) {
      const firstId = myItems.results[0]
      const item = await mlFetch<{
        id:         string
        title:      string
        family_name?: string
        attributes: Array<{ id: string; value_id?: string; value_name?: string }>
      }>(businessId, `/items/${firstId}?include_attributes=all`)

      const sizeGrid = item.attributes?.find(a => a.id === 'SIZE_GRID_ID')
      out.firstOwnItem = {
        id:           item.id,
        title:        item.title,
        SIZE_GRID_ID: sizeGrid ?? 'no encontrado',
        allAttributes: item.attributes,
      }
    }
  } catch (e) {
    out.myItemsError = String(e).slice(0, 300)
  }

  // ── C. Leer ítem de referencia (otro vendedor — puede 403) + catalog product ──
  // MLA3928256458 es un buzo de niña publicado en ML en categoría similar.
  // MLAU5148459764 es el catalog_product_id de ese ítem.
  const refEndpoints = [
    '/items/MLA3928256458?include_attributes=all',
    '/catalog/products/MLAU5148459764',
    '/catalog/products/MLAU5148459764/attributes',
  ]
  for (const ep of refEndpoints) {
    try {
      const data = await mlFetch<Record<string, unknown>>(businessId, ep)
      // Si es un item con attributes, buscar SIZE_GRID_ID
      if (Array.isArray((data as {attributes?: unknown[]}).attributes)) {
        const attrs = (data as {attributes: Array<{id: string; value_id?: string; value_name?: string}>}).attributes
        const sizeGrid = attrs.find(a => a.id === 'SIZE_GRID_ID')
        out[`ref_${ep.split('/')[1]}_SIZE_GRID_ID`] = sizeGrid ?? 'no encontrado'
        out[`ref_${ep.split('/')[1]}_all_attributes`] = attrs
      } else {
        out[`ref_${ep.split('/')[1]}`] = data
      }
    } catch (e) {
      out[`ref_err_${ep.split('/')[1]}`] = String(e).slice(0, 200)
    }
  }

  // ── D. Endpoint de dominio ─────────────────────────────────────────────────────
  const domainEndpoints = [
    '/catalog/domains/MLA-SWEATSHIRTS_AND_HOODIES',
    '/structured_data/size_grids?domain_id=MLA-SWEATSHIRTS_AND_HOODIES&site_id=MLA',
  ]
  for (const ep of domainEndpoints) {
    try {
      out[`domain_${ep.slice(-30)}`] = await mlFetch(businessId, ep)
    } catch (e) {
      out[`domain_err_${ep.slice(-30)}`] = String(e).slice(0, 100)
    }
  }

  return NextResponse.json(out)
}
