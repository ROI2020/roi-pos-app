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
  vid:              string
  variantSku:       string
  variantColor:     string
  variantSize:      string
  variantSellPrice: string
  variantImage:     string
  variantStock:     number
  variantWeight:    string   // grams
}

export interface CJProductDetail extends CJProductSummary {
  productDescription: string
  productWeight:      string
  variants:           CJVariant[]
  productImages:      string[]
}

/**
 * Busca productos en el catálogo de CJ.
 */
export async function searchCJProducts(
  token:    string,
  keyword:  string,
  page    = 1,
  pageSize = 20,
): Promise<{ list: CJProductSummary[]; total: number }> {
  const params = new URLSearchParams({
    productName: keyword,
    pageNum:     String(page),
    pageSize:    String(pageSize),
  })
  return cjFetch<{ list: CJProductSummary[]; total: number }>(
    token, `/product/list?${params}`
  )
}

/**
 * Obtiene el detalle completo de un producto (con variantes).
 */
export async function getCJProductDetail(
  token: string,
  pid:   string,
): Promise<CJProductDetail> {
  return cjFetch<CJProductDetail>(token, `/product/getProductById?pid=${pid}`)
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
      stock: v.variantStock,
    })
  }
  return map
}
