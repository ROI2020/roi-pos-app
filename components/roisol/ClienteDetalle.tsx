'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Dominio {
  id: string
  domain: string
  is_primary: boolean
}

interface Facturacion {
  cuit: string
  punto_venta: number
  razon_social: string
  condicion_iva: string
  ambiente: 'homo' | 'prod'
  activo: boolean
}

interface Props {
  cliente: {
    id: number | string   // serial4 (integer) de business
    name: string
    active_plan_id: number | null
    dominios: Dominio[]
    facturacion: Facturacion | null
  }
}

type VerificacionEstado = 'idle' | 'loading' | 'ok' | 'error'

interface VerificacionResultado {
  ok: boolean
  ultimoComprobante?: number
  error?: string
  errorKey?: string
}

export default function ClienteDetalle({ cliente }: Props) {
  const [verificacion, setVerificacion] = useState<VerificacionEstado>('idle')
  const [resultadoVerif, setResultadoVerif] = useState<VerificacionResultado | null>(null)
  const [nuevoDominio, setNuevoDominio] = useState('')
  const [addingDom, setAddingDom] = useState(false)
  const [dominios, setDominios] = useState<Dominio[]>(cliente.dominios)
  const [domError, setDomError] = useState<string | null>(null)

  async function verificarConexion() {
    if (!cliente.facturacion?.cuit) return
    setVerificacion('loading')
    setResultadoVerif(null)
    try {
      const res = await fetch(`/api/arca/verificar?cuit=${encodeURIComponent(cliente.facturacion.cuit)}`)
      const data = await res.json() as VerificacionResultado
      setResultadoVerif(data)
      setVerificacion(data.ok ? 'ok' : 'error')
    } catch {
      setVerificacion('error')
      setResultadoVerif({ ok: false, error: 'Error de red' })
    }
  }

  async function agregarDominio() {
    setDomError(null)
    if (!nuevoDominio.trim()) return
    setAddingDom(true)
    try {
      const res = await fetch(`/api/roisol/clientes/${cliente.id}/dominios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: nuevoDominio.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setDomError(data.error); return }
      setDominios(prev => [...prev, data.dominio])
      setNuevoDominio('')
    } catch {
      setDomError('Error de red')
    } finally {
      setAddingDom(false)
    }
  }

  async function eliminarDominio(domId: string) {
    const res = await fetch(`/api/roisol/clientes/${cliente.id}/dominios/${domId}`, { method: 'DELETE' })
    if (res.ok) {
      setDominios(prev => prev.filter(d => d.id !== domId))
    }
  }

  const fc = cliente.facturacion

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

      {/* Config ARCA */}
      <div className="bg-white border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Configuración ARCA</h2>
        {fc ? (
          <div className="space-y-2 text-sm">
            <Row label="CUIT" value={fc.cuit} mono />
            <Row label="Punto de venta" value={String(fc.punto_venta)} />
            <Row label="Razón social" value={fc.razon_social} />
            <Row label="Condición IVA" value={fc.condicion_iva} />
            <Row label="Ambiente" value={fc.ambiente === 'prod' ? 'Producción' : 'Homologación'}
              badge={fc.ambiente === 'prod' ? 'green' : 'amber'} />
            <Row label="Estado" value={fc.activo ? 'Activo' : 'Inactivo'}
              badge={fc.activo ? 'green' : 'red'} />
          </div>
        ) : (
          <p className="text-sm text-gray-400">Sin configuración ARCA registrada.</p>
        )}

        {fc && (
          <div className="pt-2 border-t space-y-2">
            <Button
              size="sm"
              variant="outline"
              onClick={verificarConexion}
              disabled={verificacion === 'loading'}
            >
              {verificacion === 'loading' && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              Verificar conexión ARCA
            </Button>

            {verificacion === 'ok' && resultadoVerif && (
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Conectado. Último comprobante: {resultadoVerif.ultimoComprobante ?? '—'}</span>
              </div>
            )}
            {verificacion === 'error' && resultadoVerif && (
              <div className="flex items-start gap-2 text-red-600 text-sm">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{resultadoVerif.error ?? 'Error desconocido'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dominios */}
      <div className="bg-white border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Dominios</h2>

        <ul className="space-y-2">
          {dominios.map(d => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-700">{d.domain}</span>
                {d.is_primary && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">primario</span>
                )}
              </div>
              {!d.is_primary && (
                <button
                  onClick={() => eliminarDominio(d.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                  title="Eliminar dominio"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
          {dominios.length === 0 && (
            <p className="text-sm text-gray-400">Sin dominios registrados.</p>
          )}
        </ul>

        <div className="pt-2 border-t space-y-2">
          <p className="text-xs text-gray-500 font-medium">Agregar dominio</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevoDominio}
              onChange={e => setNuevoDominio(e.target.value)}
              placeholder="nuevo.ejemplo.com"
              className="flex-1 border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), agregarDominio())}
            />
            <Button size="sm" variant="outline" onClick={agregarDominio} disabled={addingDom}>
              {addingDom ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
          </div>
          {domError && <p className="text-xs text-red-600">{domError}</p>}
        </div>
      </div>

    </div>
  )
}

function Row({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: 'green' | 'amber' | 'red' }) {
  const badgeClasses = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red:   'bg-red-100 text-red-700',
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      {badge ? (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClasses[badge]}`}>{value}</span>
      ) : (
        <span className={mono ? 'font-mono text-xs text-gray-800' : 'text-gray-800'}>{value}</span>
      )}
    </div>
  )
}
