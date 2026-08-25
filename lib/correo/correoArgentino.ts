/**
 * lib/correo/correoArgentino.ts — SERVER ONLY
 *
 * Módulo de integración con la API PAQ.AR de Correo Argentino.
 * Lee credenciales desde variables de entorno y la tabla correo_config.
 *
 * Variables de entorno requeridas:
 *   CORREO_ARGENTINO_API_KEY   — api key sensible (no va en DB)
 *   CORREO_ARGENTINO_ENV       — 'test' | 'prod' (default: 'test')
 */

import pool from '@/lib/db'

// ── URLs base ─────────────────────────────────────────────────────────────────
const BASE_URLS: Record<string, string> = {
  test: 'https://apitest.correoargentino.com.ar/paqar/v1',
  prod: 'https://api.correoargentino.com.ar/paqar/v1',
}

// ── Tipos PAQ.AR ──────────────────────────────────────────────────────────────

export interface PaqarAddress {
  streetName:   string
  streetNumber: string
  floor?:       string
  department?:  string
  cityName:     string
  state:        string   // código de 1 letra PAQ.AR (ver provinces.ts)
  zipCode:      string
  observation?: string
}

export interface PaqarParcel {
  weight:  number   // gramos
  height:  number   // cm
  width:   number   // cm
  depth:   number   // cm
}

export interface PaqarOrderPayload {
  deliveryType:    'homeDelivery' | 'agency' | 'locker'
  agencyId?:       string   // obligatorio si deliveryType != homeDelivery
  receiverName:    string
  receiverPhone:   string
  address?:        PaqarAddress  // obligatorio si deliveryType = homeDelivery
  parcel:          PaqarParcel   // solo se usa el primero — consolidar todo en uno
  declaredValue:   number
  description?:    string
  referenceNumber?: string  // nuestro online_order.id, para trazabilidad
}

export interface Agency {
  agencyId:   string
  name:       string
  address:    string
  cityName:   string
  state:      string
  zipCode:    string
  phone?:     string
  schedule?:  string
}

export interface TrackingEvent {
  date:        string
  description: string
  location?:   string
  status:      string
}

// ── Config interna ────────────────────────────────────────────────────────────

interface CarrierConfig {
  agreement: string
  apiKey:    string
  baseUrl:   string
  env:       string
}

async function getConfig(): Promise<CarrierConfig> {
  const env    = process.env.CORREO_ARGENTINO_ENV ?? 'test'
  const apiKey = process.env.CORREO_ARGENTINO_API_KEY ?? ''
  const baseUrl = BASE_URLS[env] ?? BASE_URLS.test

  // agreement viene de la DB (no sensible)
  const { rows } = await pool.query<{ agreement: string }>(
    `SELECT agreement FROM correo_config
     WHERE carrier = 'correo_argentino' AND active = true
     LIMIT 1`
  )
  const agreement = rows[0]?.agreement ?? ''

  return { agreement, apiKey, baseUrl, env }
}

// ── Helper fetch ──────────────────────────────────────────────────────────────

async function paqarFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const cfg = await getConfig()

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Apikey ${cfg.apiKey}`,
      'agreement':     cfg.agreement,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let detail = ''
    try { detail = JSON.stringify(await res.json()) } catch { detail = await res.text() }
    throw new Error(`PAQ.AR ${method} ${path} → ${res.status}: ${detail}`)
  }

  // 204 No Content — devolver objeto vacío tipado
  if (res.status === 204) return {} as T

  return res.json() as Promise<T>
}

// ── Funciones públicas ────────────────────────────────────────────────────────

/**
 * Valida que las credenciales son correctas.
 * GET /v1/auth → 204 = OK
 */
export async function validateAuth(): Promise<boolean> {
  try {
    await paqarFetch<Record<string, never>>('GET', '/auth')
    return true
  } catch {
    return false
  }
}

/**
 * Lista sucursales habilitadas.
 * GET /v1/agencies?province=C&receivesPackages=true
 */
export async function getAgencies(params?: {
  province?: string
  receivesPackages?: boolean
  deliversPackages?: boolean
}): Promise<Agency[]> {
  const qs = new URLSearchParams()
  if (params?.province)          qs.set('province',         params.province)
  if (params?.receivesPackages)  qs.set('receivesPackages', 'true')
  if (params?.deliversPackages)  qs.set('deliversPackages', 'true')

  const query = qs.toString() ? `?${qs}` : ''
  const data  = await paqarFetch<{ agencies?: Agency[] } | Agency[]>('GET', `/agencies${query}`)

  // La API puede devolver array directo o { agencies: [] }
  if (Array.isArray(data)) return data
  return (data as { agencies?: Agency[] }).agencies ?? []
}

/**
 * Crea una orden de envío.
 * POST /v1/orders → devuelve { trackingNumber: string }
 *
 * IMPORTANTE: PAQ.AR solo procesa el primer elemento de `parcels`.
 * Siempre consolidar todo el pedido en un único PaqarParcel.
 */
export async function createOrder(payload: PaqarOrderPayload): Promise<{ trackingNumber: string }> {
  const body = {
    deliveryType:    payload.deliveryType,
    ...(payload.agencyId && { agencyId: payload.agencyId }),
    receiver: {
      name:  payload.receiverName,
      phone: payload.receiverPhone,
      ...(payload.address && {
        address: {
          streetName:   payload.address.streetName,
          streetNumber: payload.address.streetNumber,
          ...(payload.address.floor      && { floor:      payload.address.floor }),
          ...(payload.address.department && { department: payload.address.department }),
          cityName: payload.address.cityName,
          state:    payload.address.state,
          zipCode:  payload.address.zipCode,
          ...(payload.address.observation && { observation: payload.address.observation }),
        },
      }),
    },
    parcels: [{
      weight: payload.parcel.weight,
      height: payload.parcel.height,
      width:  payload.parcel.width,
      depth:  payload.parcel.depth,
    }],
    declaredValue: payload.declaredValue,
    ...(payload.description    && { description:    payload.description }),
    ...(payload.referenceNumber && { referenceNumber: payload.referenceNumber }),
  }

  const result = await paqarFetch<{ trackingNumber: string }>('POST', '/orders', body)
  if (!result.trackingNumber) throw new Error('PAQ.AR no devolvió trackingNumber')
  return result
}

/**
 * Descarga el rótulo en PDF (base64).
 * POST /v1/labels → { labels: [{ base64: string }] }
 * No persistir en DB — pedir on-demand.
 */
export async function getLabel(
  trackingNumber: string,
  sellerId: string,
): Promise<string> {
  const result = await paqarFetch<{ labels?: { base64?: string }[] }>(
    'POST', '/labels',
    { labels: [{ sellerId, trackingNumber }] },
  )
  const base64 = result.labels?.[0]?.base64
  if (!base64) throw new Error('PAQ.AR no devolvió el rótulo PDF')
  return base64
}

/**
 * Historial de tracking.
 * GET /v1/tracking?trackingNumber=xxx
 */
export async function getTracking(trackingNumber: string): Promise<TrackingEvent[]> {
  const result = await paqarFetch<{ events?: TrackingEvent[] }>(
    'GET', `/tracking?trackingNumber=${encodeURIComponent(trackingNumber)}`
  )
  return result.events ?? []
}

/**
 * Cancela un envío (solo si no fue impuesto todavía).
 * PATCH /v1/orders/{trackingNumber}/cancel
 */
export async function cancelOrder(trackingNumber: string): Promise<void> {
  await paqarFetch<Record<string, never>>('PATCH', `/orders/${encodeURIComponent(trackingNumber)}/cancel`)
}
