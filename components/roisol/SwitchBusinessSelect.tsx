'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { setSession, getSession, type UserSession } from '@/lib/session'

interface Business {
  id: number
  name: string
}

export default function SwitchBusinessSelect({ businesses, currentBusinessId }: {
  businesses: Business[]
  currentBusinessId: number
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(currentBusinessId)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSwitch() {
    if (selected === currentBusinessId) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/roisol/switch-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: selected }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al cambiar negocio'); return }

      // Actualizar localStorage + cookie de sesión con los nuevos datos
      const prev = getSession()
      setSession({ ...(prev as UserSession), ...data } as UserSession)

      // Redirigir al inicio para que todo se recargue con el nuevo contexto
      router.push('/')
      router.refresh()
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={e => setSelected(Number(e.target.value))}
        disabled={loading}
        className="border rounded-md px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
      >
        {businesses.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <button
        onClick={handleSwitch}
        disabled={loading || selected === currentBusinessId}
        title="Cambiar negocio activo"
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <RefreshCw className="h-3 w-3" />
        }
        {loading ? 'Cambiando…' : 'Cambiar'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
