'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type CondicionIva = 'monotributo' | 'responsable_inscripto'
type Ambiente = 'homo' | 'prod'
type Concepto = 1 | 2 | 3

interface ArcaConfig {
  cuit: string
  puntoVenta: number
  razonSocial: string
  condicionIva: CondicionIva
  ambiente: Ambiente
  concepto: Concepto
}

interface Branch {
  id: number
  name: string
  arca_pos_number: number | null
  cuit_emisor: string | null
}

interface VerificacionResult {
  conexionWsaa: boolean
  puntoVentaHabilitado: boolean
  ultimoNroComprobante: number | null
  ambiente: Ambiente
  errorDetalle?: string
}

const MENSAJES_ERROR: Record<string, string> = {
  cert_no_configurado:      'El certificado ROISOL no está configurado en el servidor. Contactá a soporte.',
  cert_ambiente_incorrecto: 'El certificado es de producción pero el ambiente está en Homologación (o viceversa). Cambiá el ambiente a Producción en la configuración.',
  wsaa_timeout:             'No se pudo conectar con ARCA. Verificá la conexión a internet.',
  punto_venta_inactivo:     'El punto de venta no está habilitado para Web Services.\nEn el portal AFIP/ARCA → "ABM Puntos de Venta" → Nuevo PV → tipo "Electrónico — Web Services (wsfe)".\nLuego actualizá el número de PV en esta configuración.',
  delegacion_pendiente:     'El CUIT aún no delegó el servicio wsfe a ROISOL. Seguí las instrucciones de arriba.',
  cuit_sin_servicio:        'La delegación no fue encontrada. Repetí el paso de delegación y asegurate de seleccionar "wsfe".',
}

function validarCuit(cuit: string): boolean {
  const digits = cuit.replace(/\D/g, '')
  if (digits.length !== 11) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * parseInt(digits[i]), 0)
  const rem = sum % 11
  const check = rem === 0 ? 0 : rem === 1 ? 9 : 11 - rem
  return check === parseInt(digits[10])
}

const makeEmptyForm = (suggestedConcepto: Concepto): ArcaConfig => ({
  cuit: '', puntoVenta: 1, razonSocial: '', condicionIva: 'monotributo', ambiente: 'homo',
  concepto: suggestedConcepto,
})

export default function ArcaConfigPanel({ suggestedConcepto = 1 }: { suggestedConcepto?: Concepto }) {
  const [configs,        setConfigs       ] = useState<ArcaConfig[]>([])
  const [branches,       setBranches      ] = useState<Branch[]>([])
  const [form,           setForm          ] = useState<ArcaConfig>(() => makeEmptyForm(suggestedConcepto))
  const [selectedCuit,   setSelectedCuit  ] = useState<string | null>(null)
  const [saving,         setSaving        ] = useState(false)
  const [saveOk,         setSaveOk        ] = useState(false)
  const [saveError,      setSaveError     ] = useState<string | null>(null)
  const [verificando,    setVerificando   ] = useState(false)
  const [verificacion,   setVerificacion  ] = useState<VerificacionResult | null>(null)
  const [linkingBranch,  setLinkingBranch ] = useState<number | null>(null)

  const loadConfigs = useCallback(async () => {
    const res = await fetch('/api/arca/config')
    if (!res.ok) return
    const data = await res.json() as ArcaConfig[]
    setConfigs(data)
    if (data.length === 1 && !selectedCuit) {
      setForm(data[0])
      setSelectedCuit(data[0].cuit)
    }
  }, [selectedCuit])

  const loadBranches = useCallback(async () => {
    const res = await fetch('/api/branches')
    if (!res.ok) return
    setBranches(await res.json())
  }, [])

  useEffect(() => {
    loadConfigs()
    loadBranches()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function selectConfig(cfg: ArcaConfig) {
    setForm(cfg); setSelectedCuit(cfg.cuit)
    setVerificacion(null); setSaveOk(false); setSaveError(null)
  }

  function newConfig() {
    setForm(makeEmptyForm(suggestedConcepto)); setSelectedCuit(null)
    setVerificacion(null); setSaveOk(false); setSaveError(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null); setSaveOk(false)
    if (!validarCuit(form.cuit)) { setSaveError('CUIT inválido. Verificá el número y el dígito verificador.'); return }
    if (form.puntoVenta < 1)     { setSaveError('El punto de venta debe ser mayor a 0.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/arca/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, concepto: form.concepto }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error ?? 'Error al guardar'); return }
      setSaveOk(true)
      setSelectedCuit(form.cuit)
      await Promise.all([loadConfigs(), loadBranches()])
    } catch {
      setSaveError('Error de red al guardar la configuración.')
    } finally {
      setSaving(false)
    }
  }

  async function verificar() {
    if (!selectedCuit) return
    setVerificando(true); setVerificacion(null)
    try {
      const res = await fetch(`/api/arca/verificar?cuit=${encodeURIComponent(selectedCuit)}`)
      setVerificacion(await res.json() as VerificacionResult)
    } catch {
      setVerificacion({ conexionWsaa: false, puntoVentaHabilitado: false,
        ultimoNroComprobante: null, ambiente: form.ambiente, errorDetalle: 'wsaa_timeout' })
    } finally {
      setVerificando(false)
    }
  }

  async function toggleBranch(branch: Branch) {
    if (!selectedCuit) return
    setLinkingBranch(branch.id)
    const newCuit = branch.cuit_emisor === selectedCuit ? null : selectedCuit
    try {
      await fetch('/api/arca/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branch.id, cuit: newCuit }),
      })
      await loadBranches()
    } finally {
      setLinkingBranch(null)
    }
  }

  const roisolCuit = process.env.NEXT_PUBLIC_ARCA_CUIT_ROISOL ?? '[CUIT no configurado]'

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 py-4 px-3 sm:px-4 sm:py-6 sm:space-y-6">

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Configuración ARCA</h1>
        <p className="text-sm text-gray-500 mt-1">
          Facturación electrónica. Los clientes delegan el servicio wsfe al certificado de ROISOL.
        </p>
      </div>

      {/* Selector de CUITs */}
      {configs.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {configs.map(cfg => (
            <button
              key={cfg.cuit}
              onClick={() => selectConfig(cfg)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedCuit === cfg.cuit
                  ? 'bg-violet-100 border-violet-400 text-violet-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="font-mono text-xs">{cfg.cuit}</span>
              <span className="hidden sm:inline"> — {cfg.razonSocial}</span>
            </button>
          ))}
          <button
            onClick={newConfig}
            className="px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            + Nuevo CUIT
          </button>
        </div>
      )}

      {/* ── Sección 1: Datos del emisor ─── */}
      <form onSubmit={handleSave} className="border rounded-lg p-4 sm:p-5 bg-white shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-800">Datos del emisor</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
            <input
              type="text"
              value={form.cuit}
              onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))}
              placeholder="20-12345678-9"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Venta</label>
            <input
              type="number"
              value={form.puntoVenta}
              onChange={e => setForm(f => ({ ...f, puntoVenta: parseInt(e.target.value) || 1 }))}
              min={1}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              required
            />
            <p className="text-xs text-gray-400 mt-1">Debe estar registrado en ARCA como WSFEv1.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
            <input
              type="text"
              value={form.razonSocial}
              onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condición IVA</label>
            <select
              value={form.condicionIva}
              onChange={e => setForm(f => ({ ...f, condicionIva: e.target.value as CondicionIva }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="monotributo">Monotributista</option>
              <option value="responsable_inscripto">Responsable Inscripto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ambiente</label>
            <select
              value={form.ambiente}
              onChange={e => setForm(f => ({ ...f, ambiente: e.target.value as Ambiente }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="homo">Homologación (pruebas)</option>
              <option value="prod">Producción</option>
            </select>
            {form.ambiente === 'prod' && (
              <p className="text-xs text-amber-600 mt-1 font-medium">
                ⚠️ Producción emite facturas reales con validez fiscal.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Concepto AFIP
              {form.concepto !== suggestedConcepto && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, concepto: suggestedConcepto }))}
                  className="ml-2 text-xs text-violet-500 hover:underline font-normal"
                >
                  (volver al sugerido)
                </button>
              )}
            </label>
            <select
              value={form.concepto}
              onChange={e => setForm(f => ({ ...f, concepto: parseInt(e.target.value) as Concepto }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value={1}>1 — Productos{suggestedConcepto === 1 ? ' (sugerido)' : ''}</option>
              <option value={2}>2 — Servicios{suggestedConcepto === 2 ? ' (sugerido)' : ''}</option>
              <option value={3}>3 — Productos y Servicios{suggestedConcepto === 3 ? ' (sugerido)' : ''}</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Determina si facturas ventas de mercadería, servicios prestados, o ambos.
            </p>
          </div>
        </div>

        {saveOk && (
          <p className="text-sm text-green-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> Configuración guardada correctamente.
          </p>
        )}
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Guardar configuración
        </Button>
      </form>

      {/* ── Sección 2: Delegación + Verificación ─── */}
      {selectedCuit && (
        <div className="border rounded-lg p-4 sm:p-5 bg-white shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Habilitación del cliente en ARCA</h2>

          <div className="bg-slate-50 rounded-md p-3 sm:p-4 text-sm text-gray-700 space-y-3">
            <p>
              El titular del CUIT debe delegar el servicio <strong>wsfe</strong> a ROISOL en el portal de AFIP:
            </p>
            <ol className="list-decimal list-inside space-y-2.5 text-sm">
              <li>
                Ingresar a{' '}
                <span className="inline-block font-mono text-xs bg-white border px-1.5 py-0.5 rounded break-all">
                  auth.afip.gob.ar
                </span>{' '}
                con CUIT y Clave Fiscal nivel 3
              </li>
              <li>Buscar: <strong>Administrador de Relaciones de Clave Fiscal</strong></li>
              <li>
                Nueva Relación → servicio:{' '}
                <strong className="whitespace-nowrap">wsfe — Facturación Electrónica</strong>
              </li>
              <li>
                <span className="block">En &quot;Delegar a&quot;, ingresar el CUIT de ROISOL:</span>
                <code className="inline-block mt-1 bg-white border px-2 py-1 rounded font-mono text-xs break-all">
                  {roisolCuit}
                </code>
              </li>
              <li>Confirmar con la Clave Fiscal</li>
            </ol>
            <p className="text-gray-400 text-xs">
              La delegación es inmediata. Verificá la conexión con el botón de abajo.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={verificar}
            disabled={verificando}
            className="w-full sm:w-auto"
          >
            {verificando
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Verificando...</>
              : <><RefreshCw className="h-4 w-4 mr-2" />Verificar conexión con ARCA</>
            }
          </Button>

          {verificacion && (
            <div className="space-y-2 text-sm border-t pt-3">
              <div className="flex items-center gap-2">
                {verificacion.conexionWsaa
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  : <XCircle      className="h-4 w-4 text-red-500   shrink-0" />}
                <span>Conexión WSAA {verificacion.conexionWsaa ? 'establecida' : 'falló'}</span>
              </div>
              <div className="flex items-center gap-2">
                {verificacion.puntoVentaHabilitado
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  : <XCircle      className="h-4 w-4 text-red-500   shrink-0" />}
                <span>
                  PV {verificacion.puntoVentaHabilitado ? 'habilitado' : 'no habilitado'}
                  {' '}
                  <span className="text-gray-400 text-xs">
                    ({verificacion.ambiente === 'prod' ? 'Producción' : 'Homologación'})
                  </span>
                </span>
              </div>
              {verificacion.puntoVentaHabilitado && verificacion.ultimoNroComprobante !== null && (
                <p className="text-gray-500 text-xs pl-6">
                  Último comprobante: {String(verificacion.ultimoNroComprobante).padStart(8, '0')}
                </p>
              )}
              {verificacion.errorDetalle && (
                <p className="text-red-600 text-sm mt-1 pl-6 leading-snug whitespace-pre-line">
                  {MENSAJES_ERROR[verificacion.errorDetalle] ?? verificacion.errorDetalle}
                </p>
              )}
              {verificacion.conexionWsaa && verificacion.puntoVentaHabilitado && (
                <p className="text-green-600 font-medium mt-2">
                  ✅ Todo listo. Podés empezar a emitir facturas electrónicas.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sección 3: Sucursales vinculadas ─── */}
      {selectedCuit && (
        <div className="border rounded-lg p-4 sm:p-5 bg-white shadow-sm space-y-3">
          <div>
            <h2 className="font-semibold text-gray-800">Sucursales vinculadas</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Indicá qué sucursales emiten facturas con el CUIT{' '}
              <span className="font-mono">{selectedCuit}</span>.
            </p>
          </div>

          {branches.length === 0 && (
            <p className="text-sm text-gray-400">No hay sucursales configuradas.</p>
          )}

          <div className="divide-y">
            {branches.map(b => {
              const linked      = b.cuit_emisor === selectedCuit
              const otherLinked = !!b.cuit_emisor && b.cuit_emisor !== selectedCuit
              const hasPos      = !!b.arca_pos_number
              const canLink     = hasPos || linked

              return (
                <div key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{b.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      PV ARCA: <span className="font-mono">{b.arca_pos_number ?? '—'}</span>
                      {linked && (
                        <span className="ml-2 text-green-600 font-medium">✓ vinculada</span>
                      )}
                      {otherLinked && (
                        <span className="ml-2 text-amber-500">
                          otro CUIT (<span className="font-mono">{b.cuit_emisor}</span>)
                        </span>
                      )}
                      {!hasPos && !linked && (
                        <span className="ml-2 text-gray-300">sin PV ARCA</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleBranch(b)}
                    disabled={linkingBranch === b.id || !canLink}
                    className={`shrink-0 min-w-[80px] px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      linked
                        ? 'bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                        : !canLink
                          ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700'
                    }`}
                  >
                    {linkingBranch === b.id
                      ? <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                      : linked ? '✓ Vinculada' : 'Vincular'
                    }
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
