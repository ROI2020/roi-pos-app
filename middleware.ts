import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rutas de UI públicas (sin auth)
const PUBLIC_PAGES = ['/tienda', '/login']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Pasar siempre: APIs, assets y páginas públicas
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/roipos') ||
    pathname.includes('.') ||
    PUBLIC_PAGES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  const session = req.cookies.get('roipos_session')?.value

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    const { role } = JSON.parse(decodeURIComponent(session)) as { id: number; role: string }

    // Vendedor y Encargado solo pueden ir a /venta
    if (role !== 'administrador') {
      const allowed = ['/venta']
      if (!allowed.some(p => pathname.startsWith(p))) {
        return NextResponse.redirect(new URL('/venta', req.url))
      }
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
