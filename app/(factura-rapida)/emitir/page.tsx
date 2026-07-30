"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Loader2, Plus, X, CheckCircle2, XCircle, FileText,
  Upload, RefreshCw, AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FacturacionInput, FacturacionOutput } from "@/lib/facturacion/types"
import Link from "next/link"

// ── Types ──────────────────────────────────────────────────────────────────────
type FilaEstado = "idle" | "cargando" | "ok" | "error"

interface Fila {
  id:               string
  descripcion:      string
  importe:          string
  estado:           FilaEstado
  nroComprobante?:  string
  pdfUrl?:          string
  errorMsg?:        string
}

interface Cabecera {
  fecha:            string   // YYYY-MM-DD
  receptorTipo:     "consumidor_final" | "cuit"
  receptorCuit:     string
  receptorRazonSocial: string
}

interface FRConfig {
  cuit:          string
  puntoVenta:    number
  razonSocial:   string
  condicionIva:  "monotributo" | "responsable_inscripto"
  ambiente:      "homo" | "prod"
  concepto:      1 | 2 | 3
}

const MAX_FILAS = 20

const TABS = ["manual", "csv", "json"] as const
type Tab = typeof TABS[number]

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtMoney = (raw: string) => {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""))
  if (isNaN(n)) return raw
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
}

function newFila(): Fila {
  return { id: crypto.randomUUID(), descripcion: "", importe: "", estado: "idle" }
}

function buildInput(
  fila:     Fila,
  cabecera: Cabecera,
  config:   FRConfig,
): FacturacionInput {
  // YYYY-MM-DD → YYYYMMDD
  const fecha = cabecera.fecha.replace(/-/g, "")
  const importe = parseFloat(fila.importe) || 0
  return {
    emisor: {
      cuit:         config.cuit,
      puntoVenta:   config.puntoVenta,
      razonSocial:  config.razonSocial,
      condicionIva: config.condicionIva,
    },
    receptor: cabecera.receptorTipo === "consumidor_final"
      ? { condicionIva: "consumidor_final" }
      : {
          cuit:         cabecera.receptorCuit || undefined,
          razonSocial:  cabecera.receptorRazonSocial || undefined,
          condicionIva: "responsable_inscripto",
        },
    comprobante: {
      fecha,
      items: [{ descripcion: fila.descripcion, cantidad: 1, precioUnitario: importe }],
      importeTotal: importe,
      importeNeto:  importe,
      importeIva:   0,
      concepto:     config.concepto,
    },
    meta: {
      origenId:      crypto.randomUUID(),
      origenSistema: "factura_rapida",
    },
  }
}

// ── CSV parser (client-side, no external lib needed for simple format) ─────────
function parseCSV(text: string): { rows: Array<{ descripcion: string; importe: string }>; errors: string[] } {
  const lines  = text.trim().split(/\r?\n/)
  const errors: string[] = []
  const rows:   Array<{ descripcion: string; importe: string }> = []

  if (lines.length < 2) {
    errors.push("El archivo debe tener al menos una fila de datos (más el encabezado).")
    return { rows, errors }
  }

  const header = lines[0].toLowerCase().split(",").map(h => h.trim())
  const descIdx   = header.indexOf("descripcion")
  const importeIdx = header.indexOf("importe")

  if (descIdx === -1 || importeIdx === -1) {
    errors.push("El CSV debe tener columnas 'descripcion' e 'importe'.")
    return { rows, errors }
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    const desc   = cols[descIdx]   ?? ""
    const importe = cols[importeIdx] ?? ""
    if (!desc) { errors.push(`Fila ${i}: descripción vacía.`); continue }
    if (isNaN(parseFloat(importe))) { errors.push(`Fila ${i}: importe no numérico (${importe}).`); continue }
    rows.push({ descripcion: desc, importe })
    if (rows.length >= MAX_FILAS) { errors.push(`Solo se cargarán las primeras ${MAX_FILAS} filas.`); break }
  }

  return { rows, errors }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EmitirPage() {
  const [config,    setConfig   ] = useState<FRConfig | null>(null)
  const [noConfig,  setNoConfig ] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("manual")

  // Manual tab state
  const [cabecera, setCabecera] = useState<Cabecera>({
    fecha:             new Date().toISOString().slice(0, 10),
    receptorTipo:      "consumidor_final",
    receptorCuit:      "",
    receptorRazonSocial: "",
  })
  const [filas,    setFilas   ] = useState<Fila[]>([newFila()])
  const [fase,     setFase    ] = useState<"edicion" | "emitiendo" | "resultado">("edicion")

  // CSV tab state
  const [csvText,     setCsvText    ] = useState("")
  const [csvPreview,  setCsvPreview ] = useState<Array<{ descripcion: string; importe: string }>>([])
  const [csvErrors,   setCsvErrors  ] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // JSON tab state
  const [jsonText,  setJsonText ] = useState("")
  const [jsonErrors,setJsonErrors] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/factura-rapida/config")
      .then(r => { if (r.status === 404) { setNoConfig(true); return null } return r.ok ? r.json() : null })
      .then(d => { if (d) setConfig(d) })
      .catch(() => {})
  }, [])

  // ── Fila helpers ─────────────────────────────────────────────────────────────
  const addFila = () => {
    if (filas.length >= MAX_FILAS) return
    setFilas(f => [...f, newFila()])
  }

  const removeFila = (id: string) => setFilas(f => f.filter(r => r.id !== id))

  const updateFila = useCallback((id: string, patch: Partial<Fila>) => {
    setFilas(f => f.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [])

  const updateFilaIdx = useCallback((idx: number, patch: Partial<Fila>) => {
    setFilas(f => f.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }, [])

  // ── Emission ─────────────────────────────────────────────────────────────────
  const emitidas     = filas.filter(f => f.estado === "ok" || f.estado === "error").length
  const totalFilas   = filas.length
  const progresoPct  = totalFilas > 0 ? Math.round((emitidas / totalFilas) * 100) : 0

  async function emitirTodas() {
    if (!config) return
    const pendientes = filas.filter(f => f.estado === "idle" || f.estado === "error")
    if (!pendientes.length) return

    setFase("emitiendo")
    // Reset errores previos
    setFilas(f => f.map(r => r.estado === "error" ? { ...r, estado: "idle" as FilaEstado, errorMsg: undefined } : r))

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i]
      if (fila.estado === "ok") continue  // ya emitida, saltar
      updateFilaIdx(i, { estado: "cargando" })
      try {
        const input = buildInput(fila, cabecera, config)
        const res   = await fetch("/api/facturacion/emitir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error?.mensaje ?? `Error HTTP ${res.status}`)
        const out = data as FacturacionOutput
        const nro = `${String(config.puntoVenta).padStart(5, "0")}-${String(out.nroComprobante).padStart(8, "0")}`
        updateFilaIdx(i, { estado: "ok", nroComprobante: nro, pdfUrl: out.pdfUrl })
      } catch (e) {
        const msg = String(e).replace(/^Error:\s*/, "")
        updateFilaIdx(i, { estado: "error", errorMsg: msg })
      }
    }
    setFase("resultado")
  }

  async function reintentarFila(idx: number) {
    if (!config) return
    const fila = filas[idx]
    if (fila.estado !== "error") return
    updateFilaIdx(idx, { estado: "cargando", errorMsg: undefined })
    try {
      const input = buildInput(fila, cabecera, config)
      const res   = await fetch("/api/facturacion/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.mensaje ?? `Error HTTP ${res.status}`)
      const out = data as FacturacionOutput
      const nro = `${String(config.puntoVenta).padStart(5, "0")}-${String(out.nroComprobante).padStart(8, "0")}`
      updateFilaIdx(idx, { estado: "ok", nroComprobante: nro, pdfUrl: out.pdfUrl })
    } catch (e) {
      updateFilaIdx(idx, { estado: "error", errorMsg: String(e).replace(/^Error:\s*/, "") })
    }
  }

  function nuevaEmision() {
    setFilas([newFila()])
    setFase("edicion")
  }

  // ── CSV handlers ─────────────────────────────────────────────────────────────
  function handleCSVFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      setCsvText(text)
      const { rows, errors } = parseCSV(text)
      setCsvPreview(rows)
      setCsvErrors(errors)
    }
    reader.readAsText(file)
  }

  function loadCSVIntoManual() {
    setFilas(csvPreview.map(r => ({ ...newFila(), descripcion: r.descripcion, importe: r.importe })))
    setCsvText(""); setCsvPreview([]); setCsvErrors([])
    setActiveTab("manual")
    setFase("edicion")
  }

  // ── JSON handlers ─────────────────────────────────────────────────────────────
  function loadJSONIntoManual() {
    const errors: string[] = []
    let parsed: unknown
    try { parsed = JSON.parse(jsonText) } catch (e) {
      setJsonErrors([`JSON inválido: ${String(e)}`]); return
    }
    if (!Array.isArray(parsed)) { setJsonErrors(["El JSON debe ser un array de objetos."]); return }
    const rows: Array<{ descripcion: string; importe: string }> = []
    for (let i = 0; i < Math.min(parsed.length, MAX_FILAS); i++) {
      const item = parsed[i] as Record<string, unknown>
      if (!item.descripcion || typeof item.descripcion !== "string") {
        errors.push(`Ítem ${i + 1}: falta "descripcion" (string).`); continue
      }
      if (typeof item.importe !== "number" && typeof item.importe !== "string") {
        errors.push(`Ítem ${i + 1}: falta "importe" (número).`); continue
      }
      rows.push({ descripcion: item.descripcion, importe: String(item.importe) })
    }
    if (errors.length && !rows.length) { setJsonErrors(errors); return }
    setJsonErrors(errors)
    setFilas(rows.map(r => ({ ...newFila(), descripcion: r.descripcion, importe: r.importe })))
    setJsonText("")
    setActiveTab("manual")
    setFase("edicion")
  }

  // ── Total ───────────────────────────────────────────────────────────────────
  const totalImporte = filas.reduce((s, f) => s + (parseFloat(f.importe) || 0), 0)
  const fmtTotal = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(totalImporte)

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (noConfig) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900">Emitir facturas</h1>
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Configuración ARCA requerida</p>
            <p className="text-sm text-amber-700 mt-0.5">Antes de emitir facturas, configurá tu CUIT y punto de venta.</p>
            <Link href="/setup">
              <Button size="sm" className="mt-3 h-7 text-xs">Ir a Configuración →</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Emitir facturas</h1>

      {/* Tabs */}
      <div className="border-b flex gap-0">
        {(["manual", "csv", "json"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "manual" ? "Carga manual" : tab === "csv" ? "Importar CSV" : "Importar JSON"}
          </button>
        ))}
      </div>

      {/* ── TAB: MANUAL ── */}
      {activeTab === "manual" && (
        <div className="space-y-5">
          {/* Cabecera */}
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                <input
                  type="date"
                  value={cabecera.fecha}
                  onChange={e => setCabecera(c => ({ ...c, fecha: e.target.value }))}
                  disabled={fase !== "edicion"}
                  className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">Receptor</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio" name="receptor"
                      checked={cabecera.receptorTipo === "consumidor_final"}
                      onChange={() => setCabecera(c => ({ ...c, receptorTipo: "consumidor_final" }))}
                      disabled={fase !== "edicion"}
                    />
                    Consumidor Final
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio" name="receptor"
                      checked={cabecera.receptorTipo === "cuit"}
                      onChange={() => setCabecera(c => ({ ...c, receptorTipo: "cuit" }))}
                      disabled={fase !== "edicion"}
                    />
                    CUIT específico
                  </label>
                </div>
                {cabecera.receptorTipo === "cuit" && (
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={cabecera.receptorCuit}
                      onChange={e => setCabecera(c => ({ ...c, receptorCuit: e.target.value }))}
                      placeholder="20-12345678-9"
                      disabled={fase !== "edicion"}
                      className="h-8 text-sm w-36"
                    />
                    <Input
                      value={cabecera.receptorRazonSocial}
                      onChange={e => setCabecera(c => ({ ...c, receptorRazonSocial: e.target.value }))}
                      placeholder="Razón Social (opcional)"
                      disabled={fase !== "edicion"}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabla de ítems */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left w-8">#</th>
                  <th className="px-3 py-2.5 text-left">Descripción</th>
                  <th className="px-3 py-2.5 text-right w-32">Importe</th>
                  {fase !== "edicion" && <th className="px-3 py-2.5 text-left">Estado</th>}
                  {fase === "edicion" && <th className="px-2 py-2.5 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filas.map((fila, idx) => (
                  <tr key={fila.id} className={fila.estado === "error" ? "bg-red-50/50" : fila.estado === "ok" ? "bg-green-50/30" : ""}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {fase === "edicion" ? (
                        <input
                          type="text"
                          value={fila.descripcion}
                          onChange={e => updateFila(fila.id, { descripcion: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); document.getElementById(`imp-${fila.id}`)?.focus() } }}
                          maxLength={200}
                          placeholder="Descripción del servicio"
                          className="w-full border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-violet-400 rounded px-1 py-0.5 text-sm"
                        />
                      ) : (
                        <span className="text-gray-700">{fila.descripcion}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fase === "edicion" ? (
                        <input
                          id={`imp-${fila.id}`}
                          type="text"
                          inputMode="numeric"
                          value={fila.importe}
                          onChange={e => updateFila(fila.id, { importe: e.target.value.replace(/[^0-9.]/g, "") })}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              if (idx === filas.length - 1) addFila()
                              else document.querySelector<HTMLInputElement>(`input[id="desc-${filas[idx+1]?.id}"]`)?.focus()
                            }
                          }}
                          placeholder="0"
                          className="w-full border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-violet-400 rounded px-1 py-0.5 text-sm text-right"
                        />
                      ) : (
                        <span className="tabular-nums font-medium text-gray-800">
                          {fila.importe ? fmtMoney(fila.importe) : "—"}
                        </span>
                      )}
                    </td>
                    {fase !== "edicion" && (
                      <td className="px-3 py-2">
                        {fila.estado === "cargando" && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Emitiendo…
                          </span>
                        )}
                        {fila.estado === "ok" && (
                          <span className="flex items-center gap-1.5 text-xs text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            N° {fila.nroComprobante}
                            {fila.pdfUrl && (
                              <a href={fila.pdfUrl} target="_blank" rel="noopener noreferrer"
                                className="ml-1 text-violet-600 hover:underline font-medium">[PDF]</a>
                            )}
                          </span>
                        )}
                        {fila.estado === "error" && (
                          <span className="flex items-center gap-1.5 text-xs text-red-600">
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]" title={fila.errorMsg}>{fila.errorMsg}</span>
                            {fase === "resultado" && (
                              <button onClick={() => reintentarFila(idx)}
                                className="ml-1 text-blue-600 hover:underline font-medium whitespace-nowrap">
                                Reintentar
                              </button>
                            )}
                          </span>
                        )}
                        {fila.estado === "idle" && <span className="text-xs text-gray-400">—</span>}
                      </td>
                    )}
                    {fase === "edicion" && (
                      <td className="px-2 py-2">
                        {filas.length > 1 && (
                          <button onClick={() => removeFila(fila.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {fase === "edicion" && filas.length < MAX_FILAS && (
              <div className="px-4 py-2 border-t">
                <button onClick={addFila}
                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium">
                  <Plus className="h-3.5 w-3.5" /> Agregar fila
                </button>
              </div>
            )}
          </div>

          {/* Footer: total + acciones */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-600">
              {filas.length} factura{filas.length !== 1 ? "s" : ""} · Total: <strong>{fmtTotal}</strong>
            </span>

            {fase === "edicion" && (
              <Button
                onClick={emitirTodas}
                disabled={!filas.some(f => f.descripcion && f.importe)}
                className="gap-2"
              >
                <FileText className="h-4 w-4" /> Emitir todas
              </Button>
            )}

            {fase === "emitiendo" && (
              <div className="flex items-center gap-3 flex-1 max-w-xs">
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  Emitiendo {emitidas} de {totalFilas}…
                </span>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${progresoPct}%` }}
                  />
                </div>
              </div>
            )}

            {fase === "resultado" && (
              <Button variant="outline" onClick={nuevaEmision} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Nueva emisión
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: CSV ── */}
      {activeTab === "csv" && (
        <div className="space-y-5">
          <div className="bg-gray-50 border rounded-xl p-4 text-xs font-mono text-gray-600 space-y-1">
            <p className="text-gray-500 font-sans text-sm font-medium mb-2">Formato esperado del archivo:</p>
            <p>descripcion,importe</p>
            <p>Consultoría Junio 2026,15000</p>
            <p>Honorarios diseño,8500</p>
          </div>

          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-violet-300 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCSVFile(f) }}
          >
            <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Arrastrá el CSV acá o</p>
            <Button size="sm" variant="outline" className="mt-2">Seleccionar archivo CSV</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVFile(f) }} />
          </div>

          {csvErrors.length > 0 && (
            <div className="space-y-1">
              {csvErrors.map((e, i) => (
                <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          {csvPreview.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Vista previa</p>
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Descripción</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {csvPreview.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-700">{r.descripcion}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">
                          {fmtMoney(r.importe)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">{csvPreview.length} fila{csvPreview.length !== 1 ? "s" : ""} importadas correctamente.</p>
              <Button onClick={loadCSVIntoManual} className="gap-2">
                Continuar → <span className="text-xs opacity-80">(cargar en tabla manual)</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: JSON ── */}
      {activeTab === "json" && (
        <div className="space-y-5">
          <div className="bg-gray-50 border rounded-xl p-4 text-xs font-mono text-gray-600 space-y-1">
            <p className="text-gray-500 font-sans text-sm font-medium mb-2">Formato esperado:</p>
            <p>{"["}</p>
            <p className="pl-4">{'{ "descripcion": "Consultoría Junio 2026", "importe": 15000 },'}</p>
            <p className="pl-4">{'{ "descripcion": "Honorarios diseño", "importe": 8500 }'}</p>
            <p>{"]"}</p>
          </div>

          <textarea
            value={jsonText}
            onChange={e => { setJsonText(e.target.value); setJsonErrors([]) }}
            placeholder="Pegar JSON aquí..."
            rows={8}
            className="w-full border rounded-xl px-4 py-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-violet-400"
          />

          {jsonErrors.length > 0 && (
            <div className="space-y-1">
              {jsonErrors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          <Button onClick={loadJSONIntoManual} disabled={!jsonText.trim()} className="gap-2">
            Validar y cargar →
          </Button>
        </div>
      )}
    </div>
  )
}
