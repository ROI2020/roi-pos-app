"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { setSession, getSession, clearSession, landingRoute } from "@/lib/session"
import { Loader2, ShieldAlert, ArrowLeft } from "lucide-react"

const ERRORES_DOMINIO: Record<string, { titulo: string; mensaje: string; codigo: string }> = {
  dominio_no_encontrado: {
    titulo: 'Dominio no reconocido',
    mensaje: 'Este dominio no está asociado a ningún negocio en el sistema.',
    codigo: 'ERR_DOMAIN_404',
  },
  negocio_incorrecto: {
    titulo: 'Sesión de otro negocio',
    mensaje: 'Tenías una sesión activa de otro negocio. La limpiamos automáticamente — iniciá sesión de nuevo con tu cuenta de Google.',
    codigo: 'ERR_TENANT_MISMATCH',
  },
}

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: object) => void
          renderButton: (element: HTMLElement, config: object) => void
        }
      }
    }
  }
}

// Separado en componente propio para cumplir el requisito de Suspense de Next.js
function ErrorDominio() {
  const searchParams = useSearchParams()
  const errorParam   = searchParams.get('error')
  const errorDominio = errorParam ? ERRORES_DOMINIO[errorParam] : null

  if (!errorDominio) return null

  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left">
      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-amber-800">{errorDominio.titulo}</p>
        <p className="text-xs text-amber-700">{errorDominio.mensaje}</p>
        <p className="text-xs text-amber-500">Contactá a soporte · {errorDominio.codigo}</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const router  = useRouter()
  const btnRef  = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState<string | null>(null)

  useEffect(() => {
    // Si el middleware detectó que la sesión activa no pertenece a este negocio,
    // limpiarla para que el usuario pueda loguearse de nuevo con el tenant correcto.
    // Sin esto entraría en loop: sesión stale → redirect a landing → mismatch → login → ...
    const errorParam = new URLSearchParams(window.location.search).get('error')
    if (errorParam === 'negocio_incorrecto') {
      clearSession()
      return
    }

    const s = getSession()
    if (!s) return
    // If the cookie is gone (e.g. user cleared cookies but not localStorage),
    // wipe localStorage too so the Google button shows and a fresh login happens.
    const hasCookie = document.cookie.includes('roipos_session=')
    if (!hasCookie) { clearSession(); return }
    window.location.replace(landingRoute(s.role, s.product))
  }, [router])

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) return

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        ux_mode: 'popup',
      })
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline', size: 'large',
          text: 'signin_with', locale: 'es', width: 280,
        })
      }
    }
    document.head.appendChild(script)
  }, [])

  async function handleCredential(response: { credential: string }) {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'user_not_found') {
          router.push('/tienda?msg=no_account')
          return
        }
        setError(data.error)
        return
      }
      setSession(data)
      // Hard navigation para que el root layout se re-renderice con el cookie nuevo
      // (router.push reutiliza el RSC cache donde isFacturaRapida puede ser stale)
      window.location.href = landingRoute(data.role, data.product)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-6 text-center">

        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl overflow-hidden shadow-md">
            <img src="/roipos-logo-180x180.png" alt="ROIPOS" className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">ROI POS</h1>
            <p className="text-sm text-gray-500 mt-0.5">Acceso al sistema</p>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Iniciá sesión con tu cuenta de Google para acceder al sistema.
          </p>

          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Verificando acceso…</span>
            </div>
          ) : (
            <div className="flex justify-center">
              {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
                <div ref={btnRef} />
              ) : (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  Configurá <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> en Netlify para activar el login.
                </div>
              )}
            </div>
          )}

          <Suspense fallback={null}>
            <ErrorDominio />
          </Suspense>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left">
              <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <a href="/tienda"
          className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-3 w-3" />
          Volver a la tienda
        </a>
      </div>
    </div>
  )
}
