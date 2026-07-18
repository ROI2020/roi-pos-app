"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Download, Search, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface FacturaRow {
  id:                  string
  nro_comprobante_fmt: string
  fecha_cbte:          string
  importe_total:       number
  cae:                 string | null
  receptor_nombre:     string | null
  created_at:          string
  descripcion:         string | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string) => {
  const d = iso.slice(0, 10).split("-")
  return `${d[2]}/${d[1]}/${d[0]}`
}

export default function HistorialPage() {
  const [items,   setItems  ] = useState<FacturaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset,  setOffset ] = useState(0)
  const [from,    setFrom   ] = useState("")
  const [to,      setTo     ] = useState("")
  const [q,       setQ      ] = useState("")
  const [search,  setSearch ] = useState("")

  const load = useCallback(async (reset = false) => {
    setLoading(true)
    const off = reset ? 0 : offset
    const params = new URLSearchParams({ offset: String(off) })
    if (from) params.set("from", from)
    if (to)   params.set("to", to)
    if (search) params.set("q", search)
    try {
      const res  = await fetch(`/api/factura-rapida/historial?${params}`)
      const data = await res.json() as { items: FacturaRow[]; hasMore: boolean }
      setItems(prev => reset ? data.items : [...prev, ...data.items])
      setHasMore(data.hasMore)
      setOffset(off + data.items.length)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [offset, from, to, search])

  useEffect(() => { load(true) }, [from, to, search]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setOffset(0)
    setSearch(q)
  }

  if (!loading && items.length === 0 && !from && !to && !search) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900">Historial de facturas</h1>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <FileText className="h-12 w-12 opacity-30" />
          <p className="font-medium text-gray-500">Todavía no emitiste ninguna factura.</p>
          <Link href="/emitir">
            <Button size="sm">Ir a Emitir →</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Historial de facturas</h1>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Desde</label>
          <input
            type="date" value={from}
            onChange={e => { setFrom(e.target.value); setOffset(0) }}
            className="border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Hasta</label>
          <input
            type="date" value={to}
            onChange={e => { setTo(e.target.value); setOffset(0) }}
            className="border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar descripción..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button size="sm" type="submit" variant="outline" className="h-8">Buscar</Button>
        </form>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Fecha</th>
              <th className="px-4 py-2.5 text-left">Descripción</th>
              <th className="px-4 py-2.5 text-right">Importe</th>
              <th className="px-4 py-2.5 text-left">Nro. Comprobante</th>
              <th className="px-3 py-2.5 text-center w-12">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(f.fecha_cbte)}</td>
                <td className="px-4 py-2.5 text-gray-700 max-w-[240px] truncate">
                  {f.descripcion ?? f.receptor_nombre ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">
                  {fmt(f.importe_total)}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                  {f.nro_comprobante_fmt}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <a
                    href={`/api/facturacion/pdf/${f.id}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Descargar PDF"
                    className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-violet-50 text-violet-600"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Cargando…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Sin resultados para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => load(false)}>Cargar más</Button>
        </div>
      )}
    </div>
  )
}
