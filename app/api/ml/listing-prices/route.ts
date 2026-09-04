/**
 * GET /api/ml/listing-prices
 *
 * Calcula el fee de ML para un tipo de publicación + categoría + precio.
 * Llama a: GET /sites/{siteId}/listing_prices
 *
 * Query params:
 *   categoryId    — ML category ID (ej: "MLA109027")
 *   listingTypeId — "free" | "bronze" | "gold_special" | "gold_pro"
 *   price         — precio en pesos (número)
 *
 * Respuesta:
 *   { fee: number, pct: number, net: number, currency: string }
 */

import { NextResponse }              from 'next/server'
import { requireBusinessId }         from '@/lib/get-business-id'
import { getMLToken, ML_API_BASE }   from '@/lib/ml-auth'
import { getPublicSettingsByKeys }   from '@/lib/settings'

interface MLListingPriceRow {
  listing_type_id?:    string
  sale_fee_amount?:    number
  sale_fee_percentage?: number    // 0-1 en algunas versiones, 0-100 en otras
  total_amount?:       number
  price?:              number
  currency_id?:        string
}

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url          = new URL(req.url)
  const categoryId   = url.searchParams.get('categoryId')?.trim()
  const listingTypeId = url.searchParams.get('listingTypeId')?.trim()
  const priceStr     = url.searchParams.get('price')?.trim()

  if (!categoryId || !listingTypeId || !priceStr) {
    return NextResponse.json(
      { error: 'categoryId, listingTypeId y price son requeridos' },
      { status: 400 },
    )
  }

  const price = parseFloat(priceStr)
  if (isNaN(price) || price <= 0) {
    return NextResponse.json({ error: 'price inválido' }, { status: 400 })
  }

  // Site ID del negocio (default MLA = Argentina)
  const pub    = await getPublicSettingsByKeys(businessId, ['ml_site_id'])
  const siteId = pub.ml_site_id?.trim() || 'MLA'

  try {
    const token = await getMLToken(businessId)

    const qs = new URLSearchParams({
      listing_type_id: listingTypeId,
      price:           price.toFixed(2),
      quantity:        '1',
      category_id:     categoryId,
    })

    const mlRes = await fetch(
      `${ML_API_BASE}/sites/${siteId}/listing_prices?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!mlRes.ok) {
      const err = await mlRes.text()
      throw new Error(`ML API ${mlRes.status}: ${err}`)
    }

    // ML puede devolver un objeto o un array con un objeto
    const raw = await mlRes.json() as MLListingPriceRow | MLListingPriceRow[]
    const row: MLListingPriceRow = Array.isArray(raw) ? (raw[0] ?? {}) : raw

    const fee        = row.sale_fee_amount ?? 0
    const currency   = row.currency_id     ?? 'ARS'
    // ML devuelve el porcentaje como fracción (0.08) — normalizamos a porcentaje (8)
    let pct = row.sale_fee_percentage ?? 0
    if (pct > 1) pct = pct / 100  // si ML lo devuelve como 8 en vez de 0.08

    return NextResponse.json({
      fee,
      pct,                      // fracción: 0.08 = 8%
      net: price - fee,
      currency,
    })

  } catch (err) {
    console.error('[ml/listing-prices]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
