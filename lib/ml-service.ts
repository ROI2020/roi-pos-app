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
import pool from '@/lib/db'

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
  color?:         string
  colorValueId?:  string   // value_id del catálogo ML para COLOR (si la categoría lo requiere)
  size?:          string
  sizeValueId?:   string   // value_id del catálogo ML para SIZE (si la categoría lo requiere)
  availableQuantity: number
  price:          number
  pictureId?:     string   // ml_picture_id para esta variante
  sku?:           string
  barcode?:       string   // GTIN / código de barras (opcional)
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
  extraAttributes?: Array<{ id: string; value_id?: string; value_name: string }>
  /**
   * Modelo "Family Listing" para indumentaria (ropa con COLOR + talle):
   * - familyName: nombre compartido por todos los ítems de la familia
   * - colorAttribute: COLOR va como atributo raíz del ítem (no en attribute_combinations)
   * - Las variations solo contienen SIZE
   * Sin estos campos se usa el modelo estándar (COLOR+SIZE en attribute_combinations).
   */
  familyName?:      string
  colorAttribute?:  { id: string; value_id?: string; value_name: string } | null
  /**
   * Guía de talles ML para la categoría.
   * Si se provee, agrega SIZE_GRID_ID y SIZE_GRID_ROW_ID a los atributos raíz.
   * Obtenido desde la tabla ml_size_grids (descubierto una vez y reutilizado).
   */
  sizeGrid?: {
    gridId:  string                   // ej: "7498374"
    rowMap:  Record<string, string>   // ej: { "14": "7498374:6", "16": "7498374:7" }
  } | null
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
 * Crea una publicación en ML.
 *
 * Modelos soportados:
 *
 * 1. FLAT FAMILY (isFamilyModel + singleVariant):
 *    Un ítem por cada combinación color+talle. Sin `variations`.
 *    COLOR y SIZE en `attributes` raíz. family_name compartido.
 *    → Probado necesario para Buzos y Hoodies (MLA109085) y similares.
 *
 * 2. FAMILY + SIZE VARIATIONS (isFamilyModel + múltiples talles):
 *    Un ítem por color, SIZE en `variations.attribute_combinations`.
 *    COLOR en `attributes` raíz. family_name compartido.
 *    → Formato estándar ML para indumentaria con varios talles.
 *    → ML rechaza este formato para algunas categorías (error 374).
 *
 * 3. ESTÁNDAR (no isFamilyModel):
 *    Un único ítem con COLOR+SIZE en `attribute_combinations`.
 *    → Para categorías que no requieren family_name.
 */
export async function createListing(
  businessId: number,
  params:     MLListingParams,
): Promise<MLListingResult> {
  const isFamilyModel  = !!params.familyName
  // Flat family: un ítem sin variations (SIZE como atributo raíz)
  const isFlatFamily   = isFamilyModel && params.variations.length <= 1

  // ── Variantes ML ─────────────────────────────────────────────────────────────
  // Flat family: no usamos variations[]
  // Family + sizes: solo SIZE en attribute_combinations
  // Estándar: COLOR + SIZE en attribute_combinations
  let variations: unknown[] = []

  if (!isFlatFamily) {
    variations = params.variations.map(v => {
      const attributeCombinations: Array<{ id: string; value_id?: string; value_name: string }> = []

      if (!isFamilyModel && v.color) {
        attributeCombinations.push({
          id: 'COLOR',
          ...(v.colorValueId && { value_id: v.colorValueId }),
          value_name: v.color,
        })
      }
      if (v.size) {
        attributeCombinations.push({
          id: 'SIZE',
          ...(v.sizeValueId && { value_id: v.sizeValueId }),
          value_name: v.size,
        })
      }

      return {
        attribute_combinations: attributeCombinations,
        price:               v.price,
        available_quantity:  v.availableQuantity,
        ...(v.pictureId && { picture_ids: [v.pictureId] }),
        ...(v.sku       && { seller_custom_field: v.sku }),
      }
    })
  }

  const basePrice  = Math.min(...params.variations.map(v => v.price))
  const totalStock = params.variations.reduce((s, v) => s + v.availableQuantity, 0)

  // ── Atributos raíz ───────────────────────────────────────────────────────────
  const rootAttributes: Array<{ id: string; value_id?: string; value_name: string }> = [
    ...(params.extraAttributes ?? []),
  ]
  if (isFamilyModel && params.colorAttribute) {
    rootAttributes.push(params.colorAttribute)
  }
  // Flat family: SIZE también va en atributos raíz (no hay variations)
  if (isFlatFamily && params.variations[0]?.size) {
    const v = params.variations[0]
    rootAttributes.push({
      id: 'SIZE',
      value_name: v.size!,
      ...(v.sizeValueId && { value_id: v.sizeValueId }),
    })
    // SIZE_GRID_ID + SIZE_GRID_ROW_ID: requeridos por ML en categorías de indumentaria
    // con catalog_domain. El grid se obtiene de ml_size_grids (descubierto una vez
    // publicando un ítem a mano y guardado en DB). Ver /api/ml/size-grids.
    if (params.sizeGrid) {
      rootAttributes.push({
        id:         'SIZE_GRID_ID',
        value_name: params.sizeGrid.gridId,
      })
      const rowId = params.sizeGrid.rowMap[v.size!]
      if (rowId) {
        rootAttributes.push({
          id:         'SIZE_GRID_ROW_ID',
          value_name: rowId,
        })
      } else {
        console.warn(`[ml createListing] SIZE_GRID_ROW_ID no encontrado para talle "${v.size}" en grid ${params.sizeGrid.gridId}. El talle puede no estar en el mapa.`)
      }
    }
  }

  // En modo catálogo (flat family con catalog_domain), ML ignora/rechaza el campo
  // "title" porque el título viene del catalog_product_id. Lo omitimos para que
  // el error cambie y nos indique qué campo falta en su lugar.
  const isCatalogMode = isFlatFamily

  const body: Record<string, unknown> = {
    ...(!isCatalogMode && { title: params.title }),
    category_id:        params.categoryId,
    price:              basePrice,
    currency_id:        params.currency,
    available_quantity: totalStock,
    buying_mode:        'buy_it_now',
    listing_type_id:    params.listingType,
    condition:          params.condition,
    pictures:           params.pictureIds.map(id => ({ id })),
    attributes:         rootAttributes,
    ...(params.description && {
      description: { plain_text: params.description.slice(0, 50000) },
    }),
  }

  if (isFamilyModel) {
    body.family_name = params.familyName
  }

  if (variations.length > 0) {
    body.variations = variations
  }

  let result: { id: string; permalink: string }
  try {
    result = await mlFetch<{ id: string; permalink: string }>(
      businessId,
      '/items',
      { method: 'POST', body: JSON.stringify(body) },
    )
  } catch (err) {
    // Log del error en background — no bloquea el throw
    pool.query(
      `INSERT INTO ml_api_logs (business_id, action, request_body, error)
       VALUES ($1, 'createListing', $2, $3)`,
      [businessId, body, String(err)],
    ).catch(() => {/* silencioso */})
    throw err
  }

  // Log exitoso en background
  pool.query(
    `INSERT INTO ml_api_logs (business_id, action, request_body, response_body, ml_item_id)
     VALUES ($1, 'createListing', $2, $3, $4)`,
    [businessId, body, { id: result.id, permalink: result.permalink }, result.id],
  ).catch(() => {/* silencioso */})

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
