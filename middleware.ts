import { NextRequest, NextResponse } from 'next/server'

// APIs, assets y el panel ROISOL de proveedor interno se omiten del middleware.
// /roisol YA NO está aquí — ahora se protege por rol dentro del middleware.
const SKIP_PATHS = [
  '/api/',
  '/_next',
  '/favicon',
  '/icon',
]

const PUBLIC_PAGES = ['/tienda', '/login', '/sin-acceso']

// Rutas exclusivas de Factura Rápida (plan 10)
const FR_ROUTES = ['/setup', '/emitir', '/historial']

interface SessionCookie {
  id: number
  role: string
  business_id?: number
  plan_id?: number
  product?: string
}

function parseSession(raw: string | undefined): SessionCookie | null {
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as SessionCookie
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Saltar assets y APIs
  if (
    SKIP_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.includes('.') ||
    PUBLIC_PAGES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  const host = req.headers.get('host')?.replace(/^www\./, '') ?? ''
  const session = parseSession(req.cookies.get('roipos_session')?.value)

  // Sin sesión: la raíz pública va a la tienda; el resto al login
  if (!session) {
    if (pathname === '/') return NextResponse.redirect(new URL('/tienda', req.url))
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const isFacturaRapida = session.product === 'roifar'
  const isRoisolAdmin   = session.role === 'roisol_admin'

  // ── Protección de /roisol — solo roisol_admin ────────────────
  if (pathname.startsWith('/roisol')) {
    if (!isRoisolAdmin) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    // roisol_admin en /roisol: pasar sin más restricciones
    const rqh = new Headers(req.headers)
    rqh.set('x-is-factura-rapida', 'false')
    return NextResponse.next({ request: { headers: rqh } })
  }

  // ── Detección de tenant ──────────────────────────────────────
  let businessId: number | null = null
  let businessName = ''

  if (host.includes('localhost') || host.includes('127.0.0.1') || isFacturaRapida) {
    // En localhost y para usuarios ROIFAR el tenant viene de la sesión
    // (ROIFAR no tiene dominio propio en business_domains)
    businessId   = session.business_id ?? parseInt(process.env.DEV_BUSINESS_ID ?? '0', 10)
    businessName = isFacturaRapida ? 'ROIFAR' : 'DEV'
  } else {
    try {
      const res = await fetch(
        `${req.nextUrl.origin}/api/tenant/resolve?domain=${encodeURIComponent(host)}`,
        {
          headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? '' },
        }
      )
      if (res.ok) {
        const data = await res.json() as { business_id: number; business_name: string }
        businessId   = data.business_id
        businessName = data.business_name
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

  // ── Restricciones por plan ───────────────────────────────────
  if (!isRoisolAdmin) {
    const onFRRoute = FR_ROUTES.some(r => pathname.startsWith(r))

    if (isFacturaRapida) {
      // Usuarios FR solo acceden a rutas FR
      if (!onFRRoute) {
        return NextResponse.redirect(new URL('/setup', req.url))
      }
    } else {
      // Usuarios ROIPOS no acceden a rutas FR
      if (onFRRoute) {
        return NextResponse.redirect(new URL('/', req.url))
      }

      // Vendedor/encargado: solo /venta y /productos
      if (session.role !== 'administrador') {
        const allowed = ['/venta', '/productos']
        if (!allowed.some(p => pathname.startsWith(p))) {
          return NextResponse.redirect(new URL('/venta', req.url))
        }
      }
    }
  }

  // ── Inyectar headers de contexto como request headers ───────
  // IMPORTANTE: deben ir en request.headers (no response.headers) para que
  // los Server Components los lean vía headers() de next/headers.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-is-factura-rapida', String(isFacturaRapida))
  if (businessId !== null) {
    requestHeaders.set('x-business-id', String(businessId))
    requestHeaders.set('x-business-name', businessName)
  }
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
