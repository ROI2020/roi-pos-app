/**
 * lib/cj.ts — CJ Dropshipping REST API v2 (server-side only)
 *
 * Docs: https://developers.cjdropshipping.com/
 * Base: https://developers.cjdropshipping.com/api2.0/v1
 *
 * Auth: POST /authentication/getAccessToken → CJ-Access-Token header
 * Token dura ~24h; se cachea a nivel de módulo (warm serverless instances).
 */

import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1'

// ── Token cache (módulo-level, warm instances) ────────────────────────────────
const _tokenCache = new Map<string, { token: string; expiresAt: number }>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function cjHeaders(token: string) {
  return {
    'CJ-Access-Token': token,
    'Content-Type':    'application/json',
  }
}

async function cjFetch<T = unknown>(
  token: string,
  path:  string,
  init?: RequestInit,
): Promise<T> {
  const res  = await fetch(`${CJ_BASE}${path}`, {
    ...init,
    headers: { ...cjHeaders(token), ...(init?.headers ?? {}) },
    cache:   'no-store',
  })
  const data = await res.json() as { code: number; message: string; data: T }
  if (data.code !== 200) {
    throw new Error(`CJ API error [${path}]: ${data.message}`)
  }
  return data.data
}

/** Fetch crudo (sin lanzar error): devuelve el envelope completo {code, message, data} */
async function cjFetchRaw(
  token: string,
  path:  string,
  init?: RequestInit,
): Promise<{ code: number; message: string; data: unknown }> {
  const res = await fetch(`${CJ_BASE}${path}`, {
    ...init,
    headers: { ...cjHeaders(token), ...(init?.headers ?? {}) },
    cache:   'no-store',
  })
  return res.json() as Promise<{ code: number; message: string; data: unknown }>
}

// ── Autenticación ─────────────────────────────────────────────────────────────

/**
 * Obtiene un access token de CJ usando email + API key.
 * Cachea el token hasta 60s antes de que expire.
 */
export async function getCJToken(email: string, apiKey: string): Promise<string> {
  const cacheKey = email
  const cached   = _tokenCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token
  }

  const res  = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password: apiKey }),
    cache:   'no-store',
  })
  const data = await res.json() as {
    code:    number
    message: string
    data?: {
      accessToken:           string
      accessTokenExpiryDate: string   // ISO datetime
    }
  }
  if (data.code !== 200 || !data.data?.accessToken) {
    throw new Error(`CJ auth error: ${data.message}`)
  }

  const expiresAt = new Date(data.data.accessTokenExpiryDate).getTime()
  _tokenCache.set(cacheKey, { token: data.data.accessToken, expiresAt })
  return data.data.accessToken
}

/**
 * Obtiene el token CJ para un negocio específico.
 * Lee cj_api_email (público) + cj_api_key (secreto) desde settings.
 * Lanza si las credenciales no están configuradas.
 */
export async function getCJTokenForBusiness(businessId: number): Promise<string> {
  const pub    = await getPublicSettingsByKeys(businessId, ['cj_api_email'])
  const apiKey = await getSecretSetting(businessId, 'cj_api_key')

  if (!pub.cj_api_email || !apiKey) {
    throw new Error(
      `CJ Dropshipping: credenciales no configuradas para business_id=${businessId}. ` +
      'Configurarlas en Admin → Configuración → Dropshipping CJ.'
    )
  }

  return getCJToken(pub.cj_api_email, apiKey)
}

// ── Productos ─────────────────────────────────────────────────────────────────

export interface CJProductSummary {
  pid:           string
  productName:   string
  productImage:  string
  sellPrice:     string   // string decimal, ej "12.99"
  productUnit:   string   // "pieces"
  listedNum:     number   // qty en stock (estimado)
  categoryId:    string
  categoryName:  string
}

export interface CJVariant {
  vid:                  string
  variantSku:           string
  /** Color o atributo de variante ("Black", "Black yellow"). Viene de variantKey en la API. */
  variantColor:         string
  variantSize:          string
  variantSellPrice:     string
  /** Precio de venta sugerido por CJ (basado en márgenes típicos del mercado) */
  variantSugSellPrice:  string
  variantImage:         string
  /** Stock por variante. null = CJ no informa (es normal); 0 = sin stock confirmado. */
  variantStock:         number | null
  variantWeight:        string   // grams
}

export interface CJProductDetail extends CJProductSummary {
  productDescription:  string
  productWeight:       string
  /** Precio de venta sugerido por CJ a nivel producto */
  suggestSellPrice:    string
  variants:            CJVariant[]
  productImages:       string[]
}

export interface SearchCJOptions {
  keyword:      string
  page?:        number
  pageSize?:    number
  /** 'US' → solo productos en almacén USA (envío más rápido/barato a USA).
   *  'CN' → almacén China. Omitir = todos los almacenes. */
  countryCode?: string
  /** true → solo productos con stock (listedNum > 0) */
  hasInventory?: boolean
  /** Precio mínimo CJ (USD) */
  minPrice?:    number
  /** Precio máximo CJ (USD) */
  maxPrice?:    number
}

/**
 * Busca productos en el catálogo de CJ con filtros opcionales.
 */
export async function searchCJProducts(
  token:   string,
  options: SearchCJOptions | string,  // string para compat. con el uso anterior
  page    = 1,
  pageSize = 20,
): Promise<{ list: CJProductSummary[]; total: number }> {
  // Compat: el código antiguo pasa keyword como string
  const opts: SearchCJOptions = typeof options === 'string'
    ? { keyword: options, page, pageSize }
    : { page, pageSize, ...options }

  const params = new URLSearchParams({
    productName: opts.keyword,
    pageNum:     String(opts.page     ?? 1),
    pageSize:    String(opts.pageSize ?? 20),
  })
  if (opts.countryCode)        params.set('countryCode', opts.countryCode)
  if (opts.hasInventory)       params.set('hasInventory', '1')
  if (opts.minPrice != null)   params.set('minPrice', String(opts.minPrice))
  if (opts.maxPrice != null)   params.set('maxPrice', String(opts.maxPrice))

  return cjFetch<{ list: CJProductSummary[]; total: number }>(
    token, `/product/list?${params}`
  )
}

/**
 * Obtiene el detalle completo de un producto (con variantes).
 *
 * CJ v2 registra el endpoint de distinta manera según plan/versión:
 *   - POST /product/getProductById  (body: { pid })        → más común en planes recientes
 *   - GET  /product/getProductById?pid=xxx                 → planes más antiguos
 *   - GET  /product/query?pid=xxx                          → algunos mercados
 *
 * Se intenta en ese orden; "Interface not found" indica que ese path
 * no existe en este plan → se prueba el siguiente.
 */
/**
 * Devuelve la respuesta cruda de CJ para un producto, sin normalizar.
 * Útil para debug: ver exactamente qué campo names devuelve CJ en este plan/cuenta.
 * Prueba los 3 endpoints en orden, retorna el primero que responde con code=200.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCJProductRaw(token: string, pid: string): Promise<Record<string, any>> {
  const endpoints = [
    () => cjFetchRaw(token, '/product/getProductById', {
      method: 'POST', body: JSON.stringify({ pid }),
    }),
    () => cjFetchRaw(token, `/product/getProductById?pid=${pid}`),
    () => cjFetchRaw(token, `/product/query?pid=${pid}`),
  ]

  const results: Array<{ endpoint: string; response: { code: number; message: string; data: unknown } }> = []
  const names = [
    'POST /product/getProductById',
    'GET  /product/getProductById?pid',
    'GET  /product/query?pid',
  ]

  for (let i = 0; i < endpoints.length; i++) {
    try {
      const r = await endpoints[i]()
      results.push({ endpoint: names[i], response: r })
      if (r.code === 200) {
        // Devuelve el data junto con metadata de debug
        return {
          _debug: { endpoint: names[i], code: r.code, message: r.message },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(r.data as any),
        }
      }
    } catch (err) {
      results.push({ endpoint: names[i], response: { code: -1, message: String(err), data: null } })
    }
  }

  // Ninguno funcionó → devolver diagnóstico completo
  return { _debug_all_failed: true, attempts: results }
}

export async function getCJProductDetail(
  token: string,
  pid:   string,
): Promise<CJProductDetail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type RawProduct = Record<string, any>
  type Attempt = () => Promise<RawProduct>

  const attempts: Attempt[] = [
    // 1. POST con body — formato preferido en API v2 moderna
    () => cjFetch<RawProduct>(token, '/product/getProductById', {
      method: 'POST',
      body:   JSON.stringify({ pid }),
    }),
    // 2. GET query param — formato original v2
    () => cjFetch<RawProduct>(token, `/product/getProductById?pid=${pid}`),
    // 3. Endpoint alternativo documentado en algunos planes
    () => cjFetch<RawProduct>(token, `/product/query?pid=${pid}`),
  ]

  let lastError = ''
  let raw: RawProduct | null = null

  for (const attempt of attempts) {
    try {
      raw = await attempt()
      break
    } catch (err) {
      lastError = String(err)
      // Sólo continuar si el error es "endpoint no registrado"
      if (!lastError.includes('Interface not found')) throw err
    }
  }

  if (!raw) {
    throw new Error(
      `Producto CJ pid=${pid} inaccesible. ` +
      `Ningún endpoint de detalle respondió correctamente. ` +
      `Último error: ${lastError}`,
    )
  }

  // ── Normalización de field names ─────────────────────────────────────────
  // Verificado contra respuesta real de la API (endpoint /product/query):
  // - productName    → JSON string de array; el nombre limpio está en productNameEn
  // - productImage   → JSON string de array de URLs (no una URL directa)
  // - productImageSet → array de strings ✓  (usar este)
  // - variantKey     → string con el color/atributo ("Black", "Black yellow")
  // - variantSellPrice → number (no string)
  // - variantSugSellPrice → precio sugerido de venta por variante
  // - inventoryNum   → null (CJ no expone stock por variante en este endpoint)
  // - description    → campo HTML (no productDescription)

  // ── Imágenes ─────────────────────────────────────────────────────────────
  // productImageSet es el array correcto. productImage puede ser un JSON string.
  let productImages: string[] = []
  if (Array.isArray(raw.productImageSet) && raw.productImageSet.length > 0) {
    productImages = (raw.productImageSet as unknown[]).filter((x): x is string => typeof x === 'string')
  } else if (typeof raw.productImage === 'string' && raw.productImage.startsWith('[')) {
    try { productImages = JSON.parse(raw.productImage) as string[] } catch { /* ignore */ }
  }

  // ── Nombre del producto ───────────────────────────────────────────────────
  // productNameEn es el nombre limpio; productName puede ser un JSON array string
  let productName: string = raw.productNameEn ?? ''
  if (!productName) {
    const rawName = raw.productName ?? ''
    if (typeof rawName === 'string' && rawName.startsWith('[')) {
      try {
        const parts = JSON.parse(rawName) as string[]
        productName = parts.filter(Boolean).join(' ').trim()
      } catch { productName = rawName }
    } else {
      productName = String(rawName)
    }
  }

  // ── Imagen principal ──────────────────────────────────────────────────────
  const mainImage = String(raw.bigImage ?? productImages[0] ?? raw.productImage ?? '')
    .replace(/^\["|"\]$/g, '')  // limpiar si era JSON string de 1 elemento

  // ── Variantes ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants: CJVariant[] = (raw.variants ?? raw.variantList ?? []).map((v: any) => {
    // variantKey es el atributo de variante en esta versión de API ("Black", "Black yellow")
    // En otras versiones puede ser un array de objetos con keyEn/valueEn
    let variantColor = ''
    if (typeof v.variantKey === 'string' && v.variantKey) {
      variantColor = v.variantKey
    } else if (Array.isArray(v.variantKey)) {
      // Formato objeto: [{keyEn: 'Color', valueEn: 'Black'}, ...]
      for (const k of v.variantKey) {
        const kName = String(k.keyEn ?? k.keyNa ?? '').toLowerCase()
        const kVal  = String(k.valueEn ?? k.valuEn ?? k.valueNa ?? k.value ?? '')
        if (kName.includes('color') || kName.includes('colour') || !variantColor) {
          variantColor = kVal
        }
      }
    } else if (v.variantColor) {
      variantColor = String(v.variantColor)
    } else if (v.variantNameEn) {
      variantColor = String(v.variantNameEn)
    }

    // Stock: inventoryNum es el campo verificado; puede ser null (CJ no lo informa en detail)
    const rawStock = v.inventoryNum ?? v.variantStock ?? v.variantNum ?? v.variantInventory ?? v.stockNum
    const variantStock: number | null = rawStock !== null && rawStock !== undefined ? Number(rawStock) : null

    // Precios: variantSellPrice puede ser number o string
    const variantSellPrice     = String(v.variantSellPrice     ?? raw.sellPrice      ?? '0')
    const variantSugSellPrice  = String(v.variantSugSellPrice  ?? raw.suggestSellPrice ?? '0')

    return {
      vid:                 String(v.vid         ?? ''),
      variantSku:          String(v.variantSku  ?? v.sku ?? ''),
      variantColor,
      variantSize:         String(v.variantSize ?? ''),
      variantSellPrice,
      variantSugSellPrice,
      variantImage:        String(v.variantImage ?? v.variantImgUrl ?? ''),
      variantStock,
      variantWeight:       String(v.variantWeight ?? v.weight ?? ''),
    } satisfies CJVariant
  })

  // Si productImages sigue vacío, usar imágenes de variantes
  if (productImages.length === 0) {
    productImages = variants.map(v => v.variantImage).filter(Boolean)
  }

  return {
    pid:                String(raw.pid          ?? pid),
    productName,
    productImage:       mainImage,
    sellPrice:          String(raw.sellPrice    ?? '0'),
    productUnit:        String(raw.productUnit  ?? ''),
    listedNum:          Number(raw.listedNum    ?? 0),
    categoryId:         String(raw.categoryId   ?? ''),
    categoryName:       String(raw.categoryName ?? ''),
    productDescription: String(raw.description  ?? raw.productDescription ?? ''),
    productWeight:      String(raw.productWeight ?? raw.packingWeight ?? raw.weight ?? ''),
    suggestSellPrice:   String(raw.suggestSellPrice ?? '0'),
    variants,
    productImages,
  }
}

// ── Órdenes ───────────────────────────────────────────────────────────────────

export interface CJOrderItem {
  vid:      string   // CJ variant ID
  quantity: number
}

export interface CJCreateOrderParams {
  /** ID interno del pedido (debe ser único en CJ por negocio) */
  orderNumber:         string
  consigneeName:       string
  consigneePhone:      string
  consigneeEmail?:     string
  shippingCountryCode: string   // 'US' | 'AR'
  shippingCountry:     string   // nombre completo
  shippingProvince:    string
  shippingCity:        string
  shippingAddress:     string   // dirección completa (calle + número)
  shippingAddress2?:   string   // piso/dpto (opcional)
  shippingZip:         string
  remark?:             string
  products:            CJOrderItem[]
}

export interface CJOrderResult {
  cjOrderId:  string
  cjOrderNum: string
}

/**
 * Crea una orden de fulfillment en CJ Dropshipping.
 */
export async function createCJOrder(
  token:  string,
  params: CJCreateOrderParams,
): Promise<CJOrderResult> {
  const data = await cjFetch<{ orderId: string; orderNum: string }>(
    token,
    '/shopping/order/createOrder',
    {
      method: 'POST',
      body:   JSON.stringify(params),
    },
  )
  return {
    cjOrderId:  data.orderId,
    cjOrderNum: data.orderNum,
  }
}

export interface CJOrderStatus {
  orderId:      string
  orderNum:     string
  orderStatus:  string   // 'CREATED'|'IN_PRODUCTION'|'SHIPPED'|'DELIVERED'|'CANCELLED'
  trackNumber:  string | null
  trackUrl:     string | null
}

/**
 * Consulta el estado y tracking de una orden en CJ.
 */
export async function getCJOrderDetail(
  token:     string,
  cjOrderId: string,
): Promise<CJOrderStatus> {
  const data = await cjFetch<{
    orderId:     string
    orderNum:    string
    orderStatus: string
    trackNumber: string | null
    trackUrl:    string | null
  }>(token, `/shopping/order/getOrderDetail?orderId=${cjOrderId}`)

  return {
    orderId:     data.orderId,
    orderNum:    data.orderNum,
    orderStatus: data.orderStatus,
    trackNumber: data.trackNumber ?? null,
    trackUrl:    data.trackUrl    ?? null,
  }
}

// ── Tracking ──────────────────────────────────────────────────────────────────

export interface CJTrackingEvent {
  trackingDate:    string
  trackingDetail:  string
  trackingCountry: string
}

export interface CJTrackingInfo {
  trackNumber:   string
  logisticName:  string
  lastEvent:     string
  events:        CJTrackingEvent[]
}

/**
 * Obtiene los eventos de tracking de un número de guía.
 */
export async function getCJTrackingInfo(
  token:       string,
  trackNumber: string,
): Promise<CJTrackingInfo> {
  const data = await cjFetch<{
    trackNumber:  string
    logisticName: string
    lastEvent:    string
    trackInfos:   Array<{
      date:    string
      detail:  string
      country: string
    }>
  }>(token, `/logistic/trackInfo?trackNumber=${trackNumber}`)

  return {
    trackNumber:  data.trackNumber,
    logisticName: data.logisticName,
    lastEvent:    data.lastEvent,
    events:       (data.trackInfos ?? []).map(e => ({
      trackingDate:    e.date,
      trackingDetail:  e.detail,
      trackingCountry: e.country,
    })),
  }
}

// ── Sync stock/precio ─────────────────────────────────────────────────────────

export interface CJStockPrice {
  vid:   string
  price: number
  stock: number
}

/**
 * Consulta precio y stock de un producto por pid.
 * Devuelve un mapa vid → { price, stock }.
 */
export async function getCJProductStock(
  token: string,
  pid:   string,
): Promise<Map<string, CJStockPrice>> {
  const detail = await getCJProductDetail(token, pid)
  const map    = new Map<string, CJStockPrice>()
  for (const v of detail.variants) {
    map.set(v.vid, {
      vid:   v.vid,
      price: parseFloat(v.variantSellPrice) || parseFloat(detail.sellPrice) || 0,
      stock: v.variantStock ?? 0,
    })
  }
  return map
}

// ── Freight / Costos de envío ─────────────────────────────────────────────────

export interface CJFreightOption {
  /** Nombre del método de envío (ej: "CJPacket Ordinary", "USPS", "Fedex US to US #37") */
  logisticName:     string
  /** Código del método (para usar en createOrder) */
  logisticChannel?: string
  /** Costo total en USD */
  freight:          number
  /** Si el envío es gratuito */
  isFree:           boolean
  /** Días estimados de entrega (ej: 3-7 días) */
  minDeliveryDays?: number
  maxDeliveryDays?: number
  /** Tiempo de procesamiento / preparación en días (ej: 1-3 días) */
  minProcessDays?:  number
  maxProcessDays?:  number
  /** Peso cobrado en gramos */
  chargeWeight?:    number
}

/**
 * Calcula los costos de envío disponibles para un producto.
 *
 * CJ v2: POST /logistic/freightCalculate
 *
 * El API requiere `products: [{vid, quantity}]` (no vid suelto).
 * También intenta el formato legacy con vid suelto como fallback.
 */
export async function getCJFreight(
  token:  string,
  params: {
    vid:              string
    quantity:         number
    startCountryCode: string   // almacén origen: 'US' o 'CN'
    endCountryCode:   string   // destino: 'US', 'AR', etc.
    toPostalCode?:    string
  },
): Promise<CJFreightOption[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type RawFreight = Record<string, any>

  // CJ requiere formato products:[{vid,quantity}] (código 1600300 = "products must be not null"
  // si se envía vid suelto). Rate limit: 1 req/seg → NO reintentar en el mismo request.
  const body = JSON.stringify({
    startCountryCode: params.startCountryCode,
    endCountryCode:   params.endCountryCode,
    ...(params.toPostalCode ? { toPostalCode: params.toPostalCode } : {}),
    products: [{ vid: params.vid, quantity: params.quantity }],
  })

  let list: RawFreight[]
  try {
    const result = await cjFetch<RawFreight[]>(token, '/logistic/freightCalculate', {
      method: 'POST', body,
    })
    list = Array.isArray(result) ? result : []
  } catch (err) {
    // Rate limit (1600200), Interface not found, o error de red → silencioso
    const msg = String(err)
    if (!msg.includes('Interface not found') && !msg.includes('Too Many')) {
      console.warn('[getCJFreight]', msg)
    }
    return []
  }

  if (list.length === 0) return []

  return list.map(r => {
    const freight = parseFloat(String(r.freight ?? r.freightCost ?? 0)) || 0
    const isFree  = r.isFreeFreight ?? r.isFree ?? freight === 0

    // Tiempo de entrega: puede venir como número o como string "3-7"
    const parseDays = (v: unknown): number | undefined => {
      if (v == null) return undefined
      const n = Number(v)
      return isNaN(n) ? undefined : n
    }
    const parseRangeDays = (v: unknown, fallback: unknown): number | undefined => {
      if (v != null) return parseDays(v)
      if (typeof fallback === 'string' && fallback.includes('-')) {
        const parts = fallback.split('-')
        return parseDays(parts[0])
      }
      return undefined
    }

    // Tiempo de procesamiento: processDays, shippingPrepareTime, prepareTime, processingTime, etc.
    const processRaw = r.processDays ?? r.shippingPrepareTime ?? r.prepareTime
      ?? r.processingTime ?? r.processTime ?? r.processDay
    let minProcessDays: number | undefined
    let maxProcessDays: number | undefined
    if (typeof processRaw === 'string' && processRaw.includes('-')) {
      const parts = processRaw.split('-')
      minProcessDays = parseDays(parts[0])
      maxProcessDays = parseDays(parts[1])
    } else if (processRaw != null) {
      minProcessDays = parseDays(processRaw)
    }

    return {
      logisticName:    String(r.logisticName ?? r.channelName ?? ''),
      logisticChannel: r.logisticChannel ?? r.channelCode ?? undefined,
      freight,
      isFree,
      minDeliveryDays: parseRangeDays(r.minDeliveryDays, r.deliveryDays),
      maxDeliveryDays: parseRangeDays(r.maxDeliveryDays, undefined),
      minProcessDays,
      maxProcessDays,
      chargeWeight:    r.chargeWeight != null ? Number(r.chargeWeight) : undefined,
    }
  }).sort((a, b) => a.freight - b.freight)
}
