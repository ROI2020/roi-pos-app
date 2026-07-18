"use client"

import { useState, useEffect, useCallback } from "react"
import { CheckCircle2, Circle, Clock, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import ArcaConfigPanel from "@/components/arca/ArcaConfigPanel"
import Link from "next/link"

interface FRConfig {
  cuit:          string
  puntoVenta:    number
  razonSocial:   string
  condicionIva:  "monotributo" | "responsable_inscripto"
  ambiente:      "homo" | "prod"
  lastVerifiedAt: string | null
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "hoy"
  if (days === 1) return "hace 1 día"
  return `hace ${days} días`
}

export default function SetupPage() {
  const [config,       setConfig      ] = useState<FRConfig | null>(null)
  const [noConfig,     setNoConfig    ] = useState(false)
  const [paso2Manual,  setPaso2Manual ] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/factura-rapida/config")
    if (res.status === 404) { setNoConfig(true); return }
    if (res.ok) { setConfig(await res.json()); setNoConfig(false) }
  }, [])

  useEffect(() => {
    load()
    // Leer paso 2 desde localStorage
    const key = "fr_paso2_done"
    setPaso2Manual(localStorage.getItem(key) === "true")
  }, [load])

  const paso1 = !noConfig && !!config
  const paso3 = !!config?.lastVerifiedAt
  const paso4 = paso1 && paso3
  const setupCompleto = paso4

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuración ARCA</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configurá tu CUIT para emitir facturas electrónicas.</p>
      </div>

      {/* Stepper — se oculta si el setup ya está completo */}
      {!setupCompleto && (
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Pasos de configuración</h2>
          <ol className="space-y-3">
            <StepItem n={1} done={paso1} label="Configurá tu CUIT y punto de venta" />
            <StepItem
              n={2}
              done={paso2Manual}
              label="Delegá el servicio wsfe en ARCA"
              extra={
                !paso2Manual ? (
                  <div className="mt-1.5 flex items-center gap-3">
                    <a
                      href="https://auth.afip.gob.ar/contribuyente/login.xhtml"
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-violet-600 hover:underline flex items-center gap-1"
                    >
                      Ir al portal ARCA <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      size="sm" variant="outline" className="h-6 text-xs"
                      onClick={() => {
                        localStorage.setItem("fr_paso2_done", "true")
                        setPaso2Manual(true)
                      }}
                    >
                      Ya delegué ✓
                    </Button>
                  </div>
                ) : null
              }
            />
            <StepItem n={3} done={paso3} label="Verificá la conexión" />
            <StepItem n={4} done={paso4} label="¡Listo para facturar!" />
          </ol>
        </div>
      )}

      {/* Resumen cuando setup completo */}
      {setupCompleto && config && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-1">
          <p className="font-medium text-green-800 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Configuración activa
          </p>
          <p className="text-green-700">
            CUIT: <strong>{config.cuit}</strong> · PV: <strong>{config.puntoVenta}</strong> · Ambiente: <strong>{config.ambiente === "prod" ? "Producción" : "Homologación"}</strong>
          </p>
          {config.lastVerifiedAt && (
            <p className="text-green-600 text-xs">
              Última verificación: {fmtRelative(config.lastVerifiedAt)}
            </p>
          )}
          <div className="pt-2">
            <Link href="/emitir">
              <Button size="sm" className="h-7 text-xs">Ir a Emitir →</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Botón para refrescar el estado del stepper después de guardar/verificar */}
      {!setupCompleto && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={load} className="text-xs gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Refrescar estado
          </Button>
        </div>
      )}

      {/* ArcaConfigPanel reutilizado sin modificaciones */}
      <ArcaConfigPanel />
    </div>
  )
}

function StepItem({
  n, done, label, extra,
}: { n: number; done: boolean; label: string; extra?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
        done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
      }`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
      </div>
      <div className="flex-1">
        <p className={`text-sm ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
          {label}
        </p>
        {extra}
      </div>
    </li>
  )
}
