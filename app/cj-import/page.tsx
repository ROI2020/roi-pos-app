"use client"

import { useState, useCallback } from "react"
import {
  Search, Package, Plus, Loader2, ChevronLeft, ChevronRight,
  ExternalLink, CheckCircle2, Truck, Filter,
} from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Badge }    from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

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
  listedNum:          number   // stock total del producto (nivel producto, no por variante)
  variants:           CJVariant[]
  productImages:      string[]
}

interface CJFreightOption {
  logisticName:     string
  logisticChannel?: string
  freight:          number
  isFree:           boolean
  minDeliveryDays?: number
  maxDeliveryDays?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (price: string | number) =>
  `USD $${parseFloat(String(price || 0)).toFixed(2)}`

/**
 * Construye la URL canónica de un producto en CJ Dropshipping.
 * Formato actual: /product/{name-slug}-p-{pid}.html
 * El formato detail.html?pid= ya no funciona en muchos productos.
 */
const cjProductUrl = (productName: string, pid: string) => {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')   // mantiene puntos (ej: "7.4v"), reemplaza el resto
    .replace(/-+/g, '-')              // colapsa guiones múltiples
    .replace(/^-|-$/g, '')            // elimina guiones al inicio/fin
  return `https://cjdropshipping.com/product/${slug}-p-${pid}.html`
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CJImportPage() {
  const [query,     setQuery    ] = useState('')
  const [results,   setResults  ] = useState<CJProduct[]>([])
  const [total,     setTotal    ] = useState(0)
  const [page,      setPage     ] = useState(1)
  const [searching, setSearching] = useState(false)

  // Filtros
  const [warehouse, setWarehouse] = useState<'all' | 'US' | 'CN'>('all')
  const [inStock,   setInStock  ] = useState(false)
  const [minPrice,  setMinPrice ] = useState('')
  const [maxPrice,  setMaxPrice ] = useState('')

  const [selected,      setSelected     ] = useState<CJProductDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [freight,        setFreight       ] = useState<CJFreightOption[]>([])
  const [loadingFreight, setLoadingFreight] = useState(false)

  const [markup,    setMarkup   ] = useState('30')
  const [importing, setImporting] = useState(false)
  const [imported,  setImported ] = useState<Set<string>>(new Set())

  const pageSize = 20

  // ── Buscar ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (p = 1) => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const params = new URLSearchParams({
        q:       query,
        page:    String(p),
        pageSize: String(pageSize),
      })
      if (warehouse !== 'all')        params.set('warehouse', warehouse)
      if (inStock)                    params.set('inStock',   '1')
      if (minPrice.trim())            params.set('minPrice',  minPrice.trim())
      if (maxPrice.trim())            params.set('maxPrice',  maxPrice.trim())

      const res  = await fetch(`/api/admin/cj/search?${params}`)
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
  }, [query, warehouse, inStock, minPrice, maxPrice])

  // ── Ver detalle + flete ────────────────────────────────────────────────────

  const handleOpenDetail = async (pid: string) => {
    setLoadingDetail(true)
    setFreight([])
    try {
      const res  = await fetch(`/api/admin/cj/product?pid=${pid}`)
      const data = await res.json() as CJProductDetail | { error: string }
      if ('error' in data) throw new Error(data.error)
      setSelected(data)

      // Cargar flete en paralelo (no bloquea la apertura del modal).
      // Intenta CN primero; si no hay opciones, prueba US (warehouses distintos).
      const firstVid = data.variants?.[0]?.vid
      if (firstVid) {
        setLoadingFreight(true)
        const preferredFrom = warehouse === 'US' ? 'US' : 'CN'
        const fallbackFrom  = preferredFrom === 'US' ? 'CN' : 'US'

        const tryFetch = (from: string) =>
          fetch(`/api/admin/cj/freight?vid=${firstVid}&from=${from}&to=US`)
            .then(r => r.json() as Promise<CJFreightOption[] | { error: string }>)
            .then(opts => Array.isArray(opts) ? opts : [])
            .catch(() => [] as CJFreightOption[])

        tryFetch(preferredFrom).then(async (opts) => {
          const result = opts.length > 0 ? opts : await tryFetch(fallbackFrom)
          setFreight(result)
        }).finally(() => setLoadingFreight(false))
      }
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
        body:    JSON.stringify({ product: selected, markup: parseFloat(markup) || 0 }),
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

        {/* Buscador + filtros */}
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">

          {/* Fila 1: campo + botón */}
          <div className="flex gap-3">
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

          {/* Fila 2: filtros */}
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <Filter className="h-4 w-4 text-gray-400 mt-auto mb-1.5" />

            {/* Almacén */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Almacén</Label>
              <Select
                value={warehouse}
                onValueChange={v => setWarehouse(v as 'all' | 'US' | 'CN')}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los almacenes</SelectItem>
                  <SelectItem value="US">🇺🇸 US Warehouse</SelectItem>
                  <SelectItem value="CN">🇨🇳 China</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Con stock */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Disponibilidad</Label>
              <button
                type="button"
                onClick={() => setInStock(v => !v)}
                className={`h-8 px-3 rounded-md border text-xs font-medium transition-colors ${
                  inStock
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {inStock ? '✓ Solo con stock' : 'Con o sin stock'}
              </button>
            </div>

            {/* Precio mínimo */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Precio mín. (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                className="h-8 w-24 text-xs"
              />
            </div>

            {/* Precio máximo */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Precio máx. (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="sin límite"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                className="h-8 w-28 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Resultados */}
        {results.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {total.toLocaleString()} resultados para <strong>"{query}"</strong>
                {warehouse !== 'all' && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {warehouse === 'US' ? '🇺🇸 US Warehouse' : '🇨🇳 China'}
                  </Badge>
                )}
                {inStock && (
                  <Badge variant="outline" className="ml-1 text-[10px] text-green-700 border-green-300">
                    Con stock
                  </Badge>
                )}
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
                {selected.listedNum > 0 && (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                    <p className="text-xs text-green-600">Stock total CJ</p>
                    <p className="font-bold text-lg text-green-700">
                      {selected.listedNum.toLocaleString()} uds.
                    </p>
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-gray-400">Categoría</p>
                  <p className="font-medium text-gray-800">{selected.categoryName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-gray-400 mb-1">Product ID (PID)</p>
                  <code className="text-xs font-mono text-gray-700 break-all select-all">{selected.pid}</code>
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
                          <th className="text-left p-2 text-gray-500">SKU</th>
                          <th className="text-right p-2 text-gray-500">Precio</th>
                          <th className="text-right p-2 text-gray-500">Stock CJ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selected.variants.map(v => (
                          <tr key={v.vid} className="hover:bg-gray-50">
                            <td className="p-2 text-gray-700">{v.variantColor || '—'}</td>
                            <td className="p-2 text-gray-700">{v.variantSize  || '—'}</td>
                            <td className="p-2">
                              <div className="font-mono text-gray-600 text-[10px] leading-tight">
                                <span title="SKU" className="block">{v.variantSku || '—'}</span>
                                <span title="VID" className="block text-gray-400">{v.vid}</span>
                              </div>
                            </td>
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

              {/* ── Costos de envío ───────────────────────────────────────────── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Costos de envío a EE.UU.
                  </p>
                  {loadingFreight && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                </div>

                {!loadingFreight && freight.length === 0 && (
                  <p className="text-xs text-gray-400 pl-6">
                    Sin datos de envío disponibles para esta variante.
                  </p>
                )}

                {freight.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 text-gray-500">Método</th>
                          <th className="text-center p-2 text-gray-500">Entrega</th>
                          <th className="text-right p-2 text-gray-500">Costo (USD)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {freight.map((f, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="p-2 text-gray-800 font-medium">
                              {f.logisticName}
                            </td>
                            <td className="p-2 text-center text-gray-500">
                              {f.minDeliveryDays != null && f.maxDeliveryDays != null
                                ? `${f.minDeliveryDays}–${f.maxDeliveryDays} días`
                                : f.minDeliveryDays != null
                                  ? `~${f.minDeliveryDays} días`
                                  : '—'}
                            </td>
                            <td className="p-2 text-right">
                              {f.isFree ? (
                                <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px] font-semibold">
                                  Gratis
                                </Badge>
                              ) : (
                                <span className="font-mono font-semibold text-gray-800">
                                  ${f.freight.toFixed(2)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Tip: sumar el costo más barato al precio de venta */}
                    {(() => {
                      const cheapest = freight.find(f => !f.isFree)
                      const hasFreePlan = freight.some(f => f.isFree)
                      if (!cheapest && !hasFreePlan) return null
                      const cost = parseFloat(selected.sellPrice)
                      const markupPct = parseFloat(markup) || 0
                      const salePrice = cost * (1 + markupPct / 100)
                      if (hasFreePlan) {
                        return (
                          <p className="px-3 py-2 text-[10px] text-green-700 bg-green-50 border-t border-green-100">
                            💡 Este producto tiene opciones de envío gratuito desde CJ →
                            podés ofrecerlo con envío gratis a tus clientes.
                            Precio de venta sugerido: <strong>{fmt(salePrice)}</strong>
                          </p>
                        )
                      }
                      if (cheapest) {
                        const withShipping = salePrice + cheapest.freight
                        return (
                          <p className="px-3 py-2 text-[10px] text-gray-500 bg-gray-50 border-t">
                            💡 Para incluir envío gratis en tu precio: costo CJ {fmt(cost)} + envío {fmt(cheapest.freight)} + markup {markupPct}% → precio sugerido <strong>{fmt(withShipping)}</strong>
                          </p>
                        )
                      }
                    })()}
                  </div>
                )}
              </div>

              {/* Markup */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  Markup sobre precio CJ
                  <span className="text-xs text-gray-400">
                    → precio de venta: {fmt(parseFloat(selected.sellPrice) * (1 + (parseFloat(markup) || 0) / 100))}
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
                href={cjProductUrl(selected.productName, selected.pid)}
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
