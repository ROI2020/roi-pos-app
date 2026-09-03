import { NextRequest, NextResponse } from 'next/server'

// APIs, assets y el panel ROISOL de proveedor interno se omiten del middleware.
const SKIP_PATHS = [
  '/api/',
  '/_next',
  '/favicon',
  '/icon',
]

// Páginas públicas que no requieren sesión (no incluye /tienda — se maneja explícitamente)
const PUBLIC_PAGES = ['/login', '/sin-acceso']

// Rutas exclusivas de Factura Rápida (plan 10)
const FR_ROUTES = ['/setup', '/emitir', '/historial']

interface SessionCookie {
  id: number
  role: string
  business_id?: number
  plan_id?: number
  product?: string
}

interface TenantInfo {
  business_id: number
  business_name: string
  store_path: string   // '/store' (en) | '/tienda' (es)
  ga4_id: string | null
}

function parseSession(raw: string | undefined): SessionCookie | null {
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as SessionCookie
  } catch {
    return null
  }
}

// ── Cache dominio → store_path (por worker; se reinicia con cada deploy) ──────
// Evita llamar al API en cada request de la raíz pública.
const DOMAIN_STORE_PATH = new Map<string, string>()

async function resolveStorePath(
  origin: string,
  host:   string,
  key:    string,
): Promise<string> {
  if (DOMAIN_STORE_PATH.has(host)) return DOMAIN_STORE_PATH.get(host)!
  try {
    const res = await fetch(
      `${origin}/api/tenant/resolve?domain=${encodeURIComponent(host)}`,
      { headers: { 'x-internal-key': key } },
    )
    if (res.ok) {
      const data = await res.json() as TenantInfo
      const path = data.store_path ?? '/tienda'
      DOMAIN_STORE_PATH.set(host, path)
      return path
    }
  } catch { /* red caída — fallback */ }
  return '/tienda'
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = req.headers.get('host')?.replace(/^www\./, '').split(':')[0] ?? ''

  // ── 1. Rewrite /store/* → /tienda/* ─────────────────────────────────────────
  // El browser ve /store/*, Next.js sirve desde app/tienda/*.
  // El header x-store-base permite al layout saber el path público.
  if (pathname.startsWith('/store')) {
    // Evitar doble-procesamiento si ya pasó por aquí
    if (req.headers.get('x-store-rewritten') === '1') {
      return NextResponse.next()
    }
    const rewritten = req.nextUrl.clone()
    rewritten.pathname = '/tienda' + pathname.slice('/store'.length) || '/'
    const rh = new Headers(req.headers)
    rh.set('x-store-base',     '/store')
    rh.set('x-store-rewritten', '1')
    return NextResponse.rewrite(rewritten, { request: { headers: rh } })
  }

  // ── 2. Inyectar x-store-base en /tienda/* ───────────────────────────────────
  // Si el header ya está seteado (vino de un rewrite /store→/tienda), lo respeta.
  if (pathname.startsWith('/tienda')) {
    const alreadySet = req.headers.get('x-store-base')
    if (alreadySet) {
      // Llegó desde un rewrite /store → pasar sin tocar headers
      return NextResponse.next()
    }
    const rh = new Headers(req.headers)
    rh.set('x-store-base', '/tienda')
    return NextResponse.next({ request: { headers: rh } })
  }

  // ── 3. Saltar assets y APIs ──────────────────────────────────────────────────
  if (
    SKIP_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.includes('.') ||
    PUBLIC_PAGES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  const session = parseSession(req.cookies.get('roipos_session')?.value)

  // ── 4. Sin sesión ────────────────────────────────────────────────────────────
  if (!session) {
    if (pathname === '/') {
      // Redirigir a la tienda pública del dominio (en → /store, es → /tienda)
      const storePath = await resolveStorePath(
        req.nextUrl.origin,
        host,
        process.env.INTERNAL_API_KEY ?? '',
      )
      return NextResponse.redirect(new URL(storePath, req.url))
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const isFacturaRapida = session.product === 'roifar'
  const isRoisolAdmin   = session.role === 'roisol_admin'

  // ── 5. Protección de /roisol — solo roisol_admin ─────────────────────────────
  if (pathname.startsWith('/roisol')) {
    if (!isRoisolAdmin) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    const rqh = new Headers(req.headers)
    rqh.set('x-is-factura-rapida', 'false')
    return NextResponse.next({ request: { headers: rqh } })
  }

  // ── 6. Detección de tenant ───────────────────────────────────────────────────
  let businessId: number | null = null
  let businessName = ''
  let ga4Id: string | null = null

  if (host.includes('localhost') || host.includes('127.0.0.1') || isFacturaRapida) {
    businessId   = session.business_id ?? parseInt(process.env.DEV_BUSINESS_ID ?? '0', 10)
    businessName = isFacturaRapida ? 'ROIFAR' : 'DEV'
    // En local no inyectamos GA4 para no contaminar métricas de producción
  } else {
    try {
      const res = await fetch(
        `${req.nextUrl.origin}/api/tenant/resolve?domain=${encodeURIComponent(host)}`,
        {
          headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? '' },
        }
      )
      if (res.ok) {
        const data = await res.json() as TenantInfo
        businessId   = data.business_id
        businessName = data.business_name
        ga4Id        = data.ga4_id ?? null
      }
    } catch {
      // Error de red — las rutas protegidas fallarán individualmente
    }

    if (!businessId) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'dominio_no_encontrado')
      url.searchParams.set('ref', host)
      return NextResponse.redirect(url)
    }

    // Validar que el usuario pertenece al tenant (solo en producción)
    if (!isRoisolAdmin && businessId && session.business_id && session.business_id !== businessId) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'negocio_incorrecto')
      return NextResponse.redirect(url)
    }
  }

  // ── 7. Restricciones por plan ────────────────────────────────────────────────
  if (!isRoisolAdmin) {
    const onFRRoute = FR_ROUTES.some(r => pathname.startsWith(r))

    if (isFacturaRapida) {
      if (!onFRRoute) {
        return NextResponse.redirect(new URL('/setup', req.url))
      }
    } else {
      if (onFRRoute) {
        return NextResponse.redirect(new URL('/', req.url))
      }

      if (session.role !== 'administrador') {
        const allowed = ['/venta', '/productos']
        if (!allowed.some(p => pathname.startsWith(p))) {
          return NextResponse.redirect(new URL('/venta', req.url))
        }
      }
    }
  }

  // ── 8. Inyectar headers de contexto ─────────────────────────────────────────
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-is-factura-rapida', String(isFacturaRapida))
  if (businessId !== null) {
    requestHeaders.set('x-business-id',   String(businessId))
    requestHeaders.set('x-business-name', businessName)
  }
  if (ga4Id) {
    requestHeaders.set('x-ga4-id', ga4Id)
  }
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
