import { NextRequest, NextResponse } from 'next/server'

// Rutas que siempre pasan sin detección de tenant ni auth
const SKIP_PATHS = [
  '/api/',
  '/_next',
  '/favicon',
  '/icon',
  '/roisol',        // panel interno ROISOL — no necesita tenant de cliente
]

const PUBLIC_PAGES = ['/tienda', '/login', '/sin-acceso']

interface SessionCookie {
  id: number
  role: string
  business_id?: number
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

  // Saltar assets, APIs y panel ROISOL
  if (
    SKIP_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.includes('.') ||
    PUBLIC_PAGES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  const host = req.headers.get('host')?.replace(/^www\./, '') ?? ''
  const isFacturaRapida = host.startsWith('factura.') || process.env.DEV_IS_FACTURA_RAPIDA === 'true'

  // ── Detección de tenant ──────────────────────────────────────
  let businessId: number | null = null
  let businessName = ''

  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    // Desarrollo local: inyectar DEV_BUSINESS_ID desde env
    // factura.localhost usa DEV_FR_BUSINESS_ID si está definido
    const devId = isFacturaRapida && process.env.DEV_FR_BUSINESS_ID
      ? process.env.DEV_FR_BUSINESS_ID
      : process.env.DEV_BUSINESS_ID
    businessId   = devId ? parseInt(devId, 10) : null
    businessName = 'DEV'
  } else {
    // Producción: resolver dominio vía API interna
    try {
      const res = await fetch(
        `${req.nextUrl.origin}/api/tenant/resolve?domain=${encodeURIComponent(host)}`,
        {
          headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? '' },
          // La respuesta tiene Cache-Control s-maxage=300, el edge la cachea automáticamente
        }
      )
      if (res.ok) {
        const data = await res.json() as { business_id: number; business_name: string }
        businessId   = data.business_id
        businessName = data.business_name
      }
    } catch {
      // Error de red resolviendo tenant — permitir continuar sin business_id
      // Las API routes protegidas fallarán individualmente con error claro
    }

    if (!businessId) {
      // Dominio desconocido — redirigir al login con mensaje de soporte
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'dominio_no_encontrado')
      url.searchParams.set('ref', host)
      return NextResponse.redirect(url)
    }
  }

  // ── Verificación de sesión ───────────────────────────────────
  const session = parseSession(req.cookies.get('roipos_session')?.value)

  if (!session) {
    return NextResponse.redirect(new URL(isFacturaRapida ? '/sin-acceso' : '/login', req.url))
  }

  // roisol_admin: acceso total sin restricción de tenant
  if (session.role !== 'roisol_admin') {

    // Validar que el usuario pertenece al tenant del dominio
    if (businessId && session.business_id && session.business_id !== businessId) {
      const url = req.nextUrl.clone()
      url.pathname = isFacturaRapida ? '/sin-acceso' : '/login'
      url.searchParams.set('error', 'negocio_incorrecto')
      return NextResponse.redirect(url)
    }

    // Control de acceso por rol (vendedor/encargado solo pueden ver venta y productos)
    if (session.role !== 'administrador') {
      const allowed = ['/venta', '/productos']
      if (!allowed.some(p => pathname.startsWith(p))) {
        return NextResponse.redirect(new URL('/venta', req.url))
      }
    }
  }

  // Inyectar business_id en headers para que las API routes lo lean via lib/tenant.ts
  const response = NextResponse.next()
  if (businessId !== null) {
    response.headers.set('x-business-id', String(businessId))
    response.headers.set('x-business-name', businessName)
  }
  response.headers.set('x-is-factura-rapida', String(isFacturaRapida))
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
