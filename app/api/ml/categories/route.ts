/**
 * GET /api/ml/categories?q={query}
 *
 * Busca categorías en MercadoLibre usando el predictor de ML.
 * ML devuelve las categorías más relevantes para el título dado.
 *
 * Usar con el título del producto para que ML sugiera la categoría correcta.
 * Ejemplo: q="Remera básica mujer talle M" → MLA109027 (Remeras y Musculosas Mujer)
 *
 * ML endpoint: GET /sites/MLA/domain_discovery/search?q={query}&limit=5
 */

import { NextResponse }      from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { getMLToken, ML_API_BASE } from '@/lib/ml-auth'
import { getPublicSettingsByKeys } from '@/lib/settings'

interface MLDomainResult {
  domain_id:      string
  domain_name:    string
  category_id:    string
  category_name:  string
  attributes?:    Array<{
    id:           string
    name:         string
    value_id?:    string
    value_name?:  string
  }>
}

interface MLCategoryDetail {
  id:             string
  name:           string
  path_from_root: Array<{ id: string; name: string }>
}

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url   = new URL(req.url)
  const query = url.searchParams.get('q')?.trim()
  if (!query) {
    return NextResponse.json({ error: 'Parámetro q requerido' }, { status: 400 })
  }

  // Leer el site_id según el país del negocio (default MLA = Argentina)
  const pub    = await getPublicSettingsByKeys(businessId, ['ml_site_id'])
  const siteId = pub.ml_site_id?.trim() || 'MLA'

  try {
    const token = await getMLToken(businessId)

    const mlRes = await fetch(
      `${ML_API_BASE}/sites/${siteId}/domain_discovery/search?` +
      new URLSearchParams({ q: query, limit: '6' }),
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!mlRes.ok) {
      const err = await mlRes.text()
      throw new Error(`ML API ${mlRes.status}: ${err}`)
    }

    const data = await mlRes.json() as MLDomainResult[]

    // Deduplicar por category_id (ML puede devolver el mismo cat con distinto domain)
    const seen = new Set<string>()
    const unique = data.filter(d => {
      if (seen.has(d.category_id)) return false
      seen.add(d.category_id)
      return true
    })

    // Traer path_from_root de cada categoría en paralelo
    const paths = await Promise.all(
      unique.map(async d => {
        try {
          const r = await fetch(
            `${ML_API_BASE}/categories/${d.category_id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          )
          if (!r.ok) return []
          const detail = await r.json() as MLCategoryDetail
          return detail.path_from_root?.map(p => p.name) ?? []
        } catch {
          return []
        }
      }),
    )

    const categories = unique.map((d, i) => ({
      categoryId:   d.category_id,
      categoryName: d.category_name,
      domainName:   d.domain_name,
      // Ruta completa: ["Ropa y Accesorios", "Ropa para Bebés", "Buzos y Camperas"]
      pathFromRoot: paths[i],
      // Atributos pre-predichos para este título en esta categoría
      predictedAttributes: (d.attributes ?? [])
        .filter(a => a.value_name)
        .map(a => ({ id: a.id, name: a.name, value: a.value_name! })),
    }))

    return NextResponse.json({ categories, siteId })

  } catch (err) {
    console.error('[ml/categories]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
