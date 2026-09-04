/**
 * lib/ml-service.ts — SERVER ONLY
 *
 * Servicio de integración con la API de MercadoLibre.
 * Todas las operaciones van autenticadas con el token del negocio (per-business).
 *
 * Operaciones:
 *   uploadImage(businessId, imageUrl)             → ml_picture_id
 *   getMLUser(businessId)                         → datos del vendedor
 *   getCategoryAttributes(categoryId)             → atributos requeridos por categoría
 *   createListing(businessId, params)             → { mlItemId }
 *   updateVariantStock(businessId, ...)           → void
 *   pauseListing(businessId, mlItemId)            → void
 *   activateListing(businessId, mlItemId)         → void
 *   getOrder(businessId, mlOrderId)               → datos del pedido ML
 */

import { getMLToken, ML_API_BASE } from '@/lib/ml-auth'

// ── Helper: fetch autenticado ─────────────────────────────────────────────────

export async function mlFetch<T>(
  businessId: number,
  path:       string,
  options:    RequestInit = {},
): Promise<T> {
  const token = await getMLToken(businessId)
  const res   = await fetch(`${ML_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`ML API error ${res.status} ${path}: ${body}`)
  }

  return res.json() as Promise<T>
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MLVariationParams {
  color?:            string
  size?:             string
  availableQuantity: number
  price:             number
  pictureId?:        string  // ml_picture_id para esta variante
  sku?:              string
  barcode?:          string  // GTIN / código de barras (opcional)
}

export interface MLListingParams {
  title:            string
  categoryId:       string   // ej: MLA109027
  currency:         string   // 'ARS'
  listingType:      'free' | 'bronze' | 'gold_special' | 'gold_pro'
  condition:        'new' | 'used'
  basePrice:        number
  description?:     string
  pictureIds:       string[] // IDs de imágenes ya subidas a ML
  variations:       MLVariationParams[]
  /** Atributos adicionales requeridos por la categoría (ej: BRAND, GENDER) */
  extraAttributes?: Array<{ id: string; value_name: string }>
}

export interface MLListingResult {
  mlItemId:   string   // ej: MLA1234567890
  permalink:  string   // URL pública de la publicación
}

export interface MLVariation {
  id:                  number
  attribute_combinations: Array<{ id: string; value_name: string }>
  available_quantity:  number
  price:               number
  picture_ids:         string[]
}

export interface MLItem {
  id:           string
  title:        string
  status:       string
  price:        number
  variations:   MLVariation[]
  permalink:    string
}

export interface MLOrderItem {
  item: {
    id:           string
    title:        string
    variation_id: number
  }
  quantity:    number
  unit_price:  number
}

export interface MLOrder {
  id:          number
  status:      string  // 'paid' | 'confirmed' | 'cancelled' | ...
  buyer: {
    id:           number
    nickname:     string
    first_name:   string
    last_name:    string
    email:        string
    phone:        { area_code: string; number: string }
  }
  order_items: MLOrderItem[]
  shipping: {
    id:             number
    status:         string
    receiver_address?: {
      address_line:   string
      city:           { name: string }
      state:          { name: string }
      zip_code:       string
      country:        { id: string; name: string }
    }
  }
  total_amount: number
  currency_id:  string
  date_created: string
  pack_id?:     number | null
}

// ── Operaciones ───────────────────────────────────────────────────────────────

/**
 * Sube una imagen a ML CDN desde una URL pública.
 * ML no acepta URLs externas en las publicaciones — hay que subir primero.
 * Devuelve el ML picture_id para usar en la publicación.
 */
export async function uploadImage(businessId: number, imageUrl: string): Promise<string> {
  const token = await getMLToken(businessId)

  // ML acepta subir imágenes desde URL usando multipart o JSON según versión
  // Esta es la forma más simple: POST con URL en el body
  const res = await fetch(`${ML_API_BASE}/pictures`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ source: imageUrl }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ML uploadImage error ${res.status}: ${err}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}

/**
 * Obtiene datos del usuario vendedor ML (para verificar que el token es válido).
 */
export async function getMLUser(businessId: number): Promise<{ id: number; nickname: string; email: string }> {
  return mlFetch(businessId, '/users/me')
}

/**
 * Consulta los atributos requeridos de una categoría ML.
 * Útil para validar los atributos antes de publicar.
 */
export async function getCategoryAttributes(
  businessId: number,
  categoryId: string,
): Promise<Array<{ id: string; name: string; tags: Record<string, boolean>; values?: Array<{ id: string; name: string }> }>> {
  return mlFetch(businessId, `/categories/${categoryId}/attributes`)
}

/**
 * Crea una publicación en ML con variantes (color + talle).
 * Las imágenes deben estar ya subidas con uploadImage().
 */
export async function createListing(
  businessId: number,
  params:     MLListingParams,
): Promise<MLListingResult> {
  // Construir variantes ML
  const variations = params.variations.map(v => {
    const attributeCombinations: Array<{ id: string; value_name: string }> = []
    if (v.color) attributeCombinations.push({ id: 'COLOR', value_name: v.color })
    if (v.size)  attributeCombinations.push({ id: 'SIZE',  value_name: v.size  })

    // Atributos de variante: GTIN si hay barcode, EMPTY_GTIN_REASON si no.
    // value_id es obligatorio para atributos de catálogo en ML (no alcanza con value_name).
    // 27111453 = "El producto no tiene código de barras" en ML Argentina.
    const varAttributes: Array<{ id: string; value_id?: string; value_name: string }> = []
    if (v.barcode?.trim()) {
      varAttributes.push({ id: 'GTIN', value_name: v.barcode.trim() })
    } else {
      varAttributes.push({
        id:         'EMPTY_GTIN_REASON',
        value_id:   '27111453',
        value_name: 'El producto no tiene código de barras',
      })
    }
    if (v.sku?.trim()) {
      varAttributes.push({ id: 'SELLER_SKU', value_name: v.sku.trim() })
    }

    return {
      attribute_combinations: attributeCombinations,
      price:               v.price,
      available_quantity:  v.availableQuantity,
      ...(v.pictureId && { picture_ids: [v.pictureId] }),
      ...(v.sku       && { seller_custom_field: v.sku }),   // campo legacy, mantenemos ambos
      attributes:          varAttributes,
    }
  })

  // Precio base = mínimo entre variantes (ML lo requiere)
  const basePrice = Math.min(...params.variations.map(v => v.price))

  const body: Record<string, unknown> = {
    title:          params.title,
    category_id:    params.categoryId,
    price:          basePrice,
    currency_id:    params.currency,
    buying_mode:    'buy_it_now',
    listing_type_id: params.listingType,
    condition:      params.condition,
    pictures:       params.pictureIds.map(id => ({ id })),
    attributes:     [...(params.extraAttributes ?? [])],
    ...(params.description && {
      description: { plain_text: params.description.slice(0, 50000) },
    }),
  }

  // Con variations: ML ignora available_quantity del root y lo suma de las variantes.
  // Sin variations: hay que ponerlo (ítem sin variantes).
  if (variations.length > 0) {
    body.variations = variations
    // NO incluir available_quantity en el root — ML lo suma de las variantes
  } else {
    body.available_quantity = params.variations[0]?.availableQuantity ?? 0
  }

  const result = await mlFetch<{ id: string; permalink: string }>(
    businessId,
    '/items',
    { method: 'POST', body: JSON.stringify(body) },
  )

  return { mlItemId: result.id, permalink: result.permalink }
}

/**
 * Actualiza el stock de una variante específica de ML.
 * Llamar después de cada venta en ROIPOS.
 */
export async function updateVariantStock(
  businessId:    number,
  mlItemId:      string,
  mlVariationId: number,
  newQuantity:   number,
): Promise<void> {
  await mlFetch(businessId, `/items/${mlItemId}/variations/${mlVariationId}`, {
    method: 'PUT',
    body:   JSON.stringify({ available_quantity: newQuantity }),
  })
}

/**
 * Actualiza el stock de un ítem sin variantes.
 */
export async function updateItemStock(
  businessId:  number,
  mlItemId:    string,
  newQuantity: number,
): Promise<void> {
  await mlFetch(businessId, `/items/${mlItemId}`, {
    method: 'PUT',
    body:   JSON.stringify({ available_quantity: newQuantity }),
  })
}

/**
 * Pausa una publicación (cuando el stock llega a 0).
 */
export async function pauseListing(businessId: number, mlItemId: string): Promise<void> {
  await mlFetch(businessId, `/items/${mlItemId}`, {
    method: 'PUT',
    body:   JSON.stringify({ status: 'paused' }),
  })
}

/**
 * Reactiva una publicación pausada (cuando entra stock nuevo).
 */
export async function activateListing(businessId: number, mlItemId: string): Promise<void> {
  await mlFetch(businessId, `/items/${mlItemId}`, {
    method: 'PUT',
    body:   JSON.stringify({ status: 'active' }),
  })
}

/**
 * Obtiene los datos de una publicación ML (estado, stock, variantes).
 */
export async function getMLItem(businessId: number, mlItemId: string): Promise<MLItem> {
  return mlFetch(businessId, `/items/${mlItemId}`)
}

/**
 * Obtiene los datos de un pedido ML.
 * Se llama desde el webhook al recibir una notificación de pedido.
 */
export async function getMLOrder(businessId: number, mlOrderId: string): Promise<MLOrder> {
  return mlFetch(businessId, `/orders/${mlOrderId}`)
}
