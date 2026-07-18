"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { setSession } from "@/lib/session"
import { Loader2, ShieldAlert } from "lucide-react"
import { Suspense } from "react"

declare global {
  interface Window {
    google: {
      accounts: { id: { initialize: (c: object) => void; renderButton: (el: HTMLElement, c: object) => void } }
    }
  }
}

function ErrorMsg() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  if (!error) return null
  const msg = error === 'negocio_incorrecto'
    ? 'Tu cuenta no tiene acceso a este negocio.'
    : 'Tu cuenta no está habilitada para este servicio.'
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left">
      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-800">{msg}</p>
    </div>
  )
}

export default function SinAccesoPage() {
  const router  = useRouter()
  const btnRef  = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState<string | null>(null)

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
          theme: 'outline', size: 'large', text: 'signin_with', locale: 'es', width: 280,
        })
      }
    }
    document.head.appendChild(script)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      router.push('/setup')
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-6 text-center">

        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl font-bold text-violet-700 tracking-tight">ROISOL</span>
          <span className="text-sm font-semibold text-slate-600">Factura Rápida</span>
          <p className="text-sm text-gray-500 mt-1">Facturación electrónica ARCA</p>
        </div>

        <div className="border-t border-gray-100" />

        <div className="space-y-4">
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
                  Configurá <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> para activar el login.
                </div>
              )}
            </div>
          )}

          <Suspense fallback={null}><ErrorMsg /></Suspense>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left">
              <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-1">
          <p className="text-xs text-gray-500">¿No tenés cuenta? Contactá a ROISOL para habilitar tu acceso.</p>
          <a href="mailto:contacto@roisol.com.ar" className="text-xs text-violet-600 hover:underline">
            contacto@roisol.com.ar
          </a>
        </div>
      </div>
    </div>
  )
}
