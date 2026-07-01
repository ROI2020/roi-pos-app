"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { setSession, getSession, landingRoute } from "@/lib/session"
import { Loader2, ShieldAlert, ArrowLeft } from "lucide-react"

const ERRORES_DOMINIO: Record<string, { titulo: string; mensaje: string; codigo: string }> = {
  dominio_no_encontrado: {
    titulo: 'Dominio no reconocido',
    mensaje: 'Este dominio no está asociado a ningún negocio en el sistema.',
    codigo: 'ERR_DOMAIN_404',
  },
  negocio_incorrecto: {
    titulo: 'Acceso incorrecto',
    mensaje: 'Tu cuenta no corresponde a este negocio.',
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

export default function LoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const btnRef       = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState<string | null>(null)

  const errorParam   = searchParams.get('error')
  const errorDominio = errorParam ? ERRORES_DOMINIO[errorParam] : null

  useEffect(() => {
    const s = getSession()
    if (s) router.replace(landingRoute(s.role))
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
      if (!res.ok) { setError(data.error); return }
      setSession(data)
      router.push(landingRoute(data.role))
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

          {errorDominio && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left">
              <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800">{errorDominio.titulo}</p>
                <p className="text-xs text-amber-700">{errorDominio.mensaje}</p>
                <p className="text-xs text-amber-500">Contactá a soporte · {errorDominio.codigo}</p>
              </div>
            </div>
          )}

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
