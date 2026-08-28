"use client"

import { useState, useCallback } from "react"
import { Search, Package, Plus, Loader2, ChevronLeft, ChevronRight, ExternalLink, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Badge }    from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CJProduct {
  pid:          string
  productName:  string
  productImage: string
  sellPrice:    string
  categoryName: string
}

interface CJVariant {
  vid:              string
  variantSku:       string
  variantColor:     string
  variantSize:      string
  variantSellPrice: string
  variantImage:     string
  variantStock:     number
}

interface CJProductDetail extends CJProduct {
  productDescription: string
  productWeight:      string
  variants:           CJVariant[]
  productImages:      string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (price: string) =>
  `USD $${parseFloat(price || '0').toFixed(2)}`

// ── Componente principal ──────────────────────────────────────────────────────

export default function CJImportPage() {
  const [query,    setQuery   ] = useState('')
  const [results,  setResults ] = useState<CJProduct[]>([])
  const [total,    setTotal   ] = useState(0)
  const [page,     setPage    ] = useState(1)
  const [searching,setSearching] = useState(false)

  const [selected, setSelected] = useState<CJProductDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [markup,     setMarkup    ] = useState('30')
  const [importing,  setImporting ] = useState(false)
  const [imported,   setImported  ] = useState<Set<string>>(new Set())

  const pageSize = 20

  // ── Buscar ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (p = 1) => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `/api/admin/cj/search?q=${encodeURIComponent(query)}&page=${p}&pageSize=${pageSize}`
      )
      const data = await res.json() as { list: CJProduct[]; total: number } | { error: string }
      if ('error' in data) throw new Error(data.error)
      setResults(data.list ?? [])
      setTotal(data.total ?? 0)
      setPage(p)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSearching(false)
    }
  }, [query])

  // ── Ver detalle ───────────────────────────────────────────────────────────

  const handleOpenDetail = async (pid: string) => {
    setLoadingDetail(true)
    try {
      const res  = await fetch(`/api/admin/cj/product?pid=${pid}`)
      const data = await res.json() as CJProductDetail | { error: string }
      if ('error' in data) throw new Error(data.error)
      setSelected(data)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setLoadingDetail(false)
    }
  }

  // ── Importar ──────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!selected) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/cj/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          product:    selected,
          markup:     parseFloat(markup) || 0,
        }),
      })
      const data = await res.json() as { productId: number } | { error: string }
      if ('error' in data) throw new Error(data.error)
      setImported(prev => new Set([...prev, selected.pid]))
      toast.success(`"${selected.productName}" importado correctamente`)
      setSelected(null)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setImporting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-violet-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Importar desde CJ Dropshipping</h1>
            <p className="text-sm text-gray-500">Buscá productos en el catálogo de CJ y agregalos a tu tienda</p>
          </div>
        </div>

        {/* Buscador */}
        <div className="bg-white rounded-xl border shadow-sm p-4 flex gap-3">
          <Input
            placeholder="Ej: wireless earbuds, led ring light, phone case..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch(1)}
            className="flex-1"
          />
          <Button onClick={() => handleSearch(1)} disabled={searching || !query.trim()}>
            {searching
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Search className="h-4 w-4" />
            }
            <span className="ml-2 hidden sm:inline">Buscar</span>
          </Button>
        </div>

        {/* Resultados */}
        {results.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {total.toLocaleString()} resultados para <strong>"{query}"</strong>
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => handleSearch(page - 1)}
                    disabled={page === 1 || searching}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600">Pág {page} / {totalPages}</span>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => handleSearch(page + 1)}
                    disabled={page === totalPages || searching}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {results.map(p => (
                <button
                  key={p.pid}
                  onClick={() => handleOpenDetail(p.pid)}
                  disabled={loadingDetail}
                  className="bg-white rounded-xl border shadow-sm overflow-hidden text-left hover:border-violet-400 hover:shadow-md transition-all group"
                >
                  {/* Imagen */}
                  <div className="aspect-square bg-gray-100 overflow-hidden relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.productImage}
                      alt={p.productName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { (e.target as HTMLImageElement).src = '/placeholder.png' }}
                    />
                    {imported.has(p.pid) && (
                      <div className="absolute inset-0 bg-green-500/80 flex items-center justify-center">
                        <CheckCircle2 className="h-10 w-10 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 space-y-1">
                    <p className="text-xs text-gray-800 font-medium line-clamp-2 leading-tight">
                      {p.productName}
                    </p>
                    <p className="text-xs text-violet-600 font-bold">{fmt(p.sellPrice)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{p.categoryName}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Estado vacío */}
        {results.length === 0 && !searching && (
          <div className="text-center py-20 text-gray-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Buscá un producto para empezar</p>
          </div>
        )}
      </div>

      {/* ── Modal detalle + import ── */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base leading-snug pr-6">
                {selected.productName}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Imágenes */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(selected.productImages?.length ? selected.productImages : [selected.productImage]).slice(0, 6).map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={img}
                    alt=""
                    className="w-20 h-20 object-cover rounded-lg flex-shrink-0 border"
                  />
                ))}
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Precio CJ</p>
                  <p className="font-bold text-lg text-gray-900">{fmt(selected.sellPrice)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Variantes</p>
                  <p className="font-bold text-lg text-gray-900">{selected.variants?.length ?? 0}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-gray-400">Categoría</p>
                  <p className="font-medium text-gray-800">{selected.categoryName}</p>
                </div>
              </div>

              {/* Variantes */}
              {selected.variants?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Variantes</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 text-gray-500">Color</th>
                          <th className="text-left p-2 text-gray-500">Talle</th>
                          <th className="text-right p-2 text-gray-500">Precio</th>
                          <th className="text-right p-2 text-gray-500">Stock CJ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selected.variants.map(v => (
                          <tr key={v.vid} className="hover:bg-gray-50">
                            <td className="p-2 text-gray-700">{v.variantColor || '—'}</td>
                            <td className="p-2 text-gray-700">{v.variantSize  || '—'}</td>
                            <td className="p-2 text-right font-mono text-gray-800">
                              {fmt(v.variantSellPrice || selected.sellPrice)}
                            </td>
                            <td className={`p-2 text-right font-medium ${v.variantStock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {v.variantStock > 0 ? v.variantStock : 'Sin stock'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Markup */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  Markup sobre precio CJ
                  <span className="text-xs text-gray-400">
                    → precio de venta: {fmt(String(parseFloat(selected.sellPrice) * (1 + (parseFloat(markup) || 0) / 100)))}
                  </span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="500"
                    value={markup}
                    onChange={e => setMarkup(e.target.value)}
                    className="w-28 text-sm"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>

              {imported.has(selected.pid) && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Este producto ya fue importado
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
              <a
                href={`https://cjdropshipping.com/product/detail.html?pid=${selected.pid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 px-3 py-2"
              >
                Ver en CJ <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />
                }
                Importar al catálogo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
