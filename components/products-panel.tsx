"use client"

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react"
import {
  LayoutGrid, List, Search, SlidersHorizontal, Pencil, Upload,
  ImageOff, Loader2, X, ChevronDown, Package, Plus, Rows3,
  Globe, CheckCircle2, Circle, History, Calendar, ShoppingCart,
  Tag, ArrowLeftRight,
} from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label }    from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// ── Types ──────────────────────────────────────────────────────────────────────
interface LookupItem  { id: number; name: string }

interface Product {
  id:           number
  name:         string
  description:  string | null
  base_price:   number
  cuotas:       number
  photo_url:    string | null
  category_id:  number | null; category_name:  string | null
  age_group_id: number | null; age_group_name: string | null
  season_id:    number | null; season_name:    string | null
  gender_id:    number | null; gender_name:    string | null
  exportable_whatsapp:  boolean
  exportable_instagram: boolean
  exportable_facebook:  boolean
  exportable_web:       boolean
  variant_count: number
  stock_count:   number
}

interface Variant {
  id:          number
  sku:         string
  color:       string
  size:        string
  unit_cost:   number | null
  branch_name: string | null
  status:      'vendido' | 'en_stock' | 'sin_asignar'
  sold_at:     string | null
}

interface HistoryEvent {
  type:        'creacion' | 'compra' | 'venta' | 'cambio_devuelto' | 'cambio_recibido'
  date:        string
  description: string
  amount:      number | null
  extra: {
    quantity?:         number
    title?:            string
    invoice?:          string
    supplier?:         string
    purchase_id?:      number
    sale_id?:          number
    discount?:         number
    total?:            number
    branch?:           string
    user?:             string
    exchange_id?:      number
    new_variant?:      string
    returned_variant?: string
    difference?:       number
  }
}

type View    = 'grid' | 'list'
type SortKey = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_desc'

// Canales de exportación (mantenidos internamente para el backend)
const EXPORT_KEYS = [
  'exportable_whatsapp', 'exportable_instagram',
  'exportable_facebook', 'exportable_web',
] as const

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

async function resizeImage(file: File, maxPx = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = url
  })
}

// ── Toggle único "Redes" ──────────────────────────────────────────────────────
function RedesToggle({
  product,
  onToggle,
  compact = false,
}: {
  product:  Product
  onToggle: (updates: Partial<Product>) => void
  compact?: boolean
}) {
  const anyActive = EXPORT_KEYS.some(k => product[k])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newVal = !anyActive
    const updates = Object.fromEntries(EXPORT_KEYS.map(k => [k, newVal])) as Partial<Product>
    onToggle(updates)
  }

  return (
    <button
      onClick={handleClick}
      title={anyActive ? 'Quitar de todas las redes' : 'Publicar en todas las redes'}
      className={`${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}
        font-semibold border rounded transition-all hover:opacity-80 active:scale-95 flex items-center gap-1
        ${anyActive
          ? 'bg-violet-100 text-violet-700 border-violet-300'
          : 'bg-gray-50 text-gray-300 border-gray-200'
        }`}
    >
      <Globe className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      Redes
    </button>
  )
}

// ── Miniatura de foto ──────────────────────────────────────────────────────────
function PhotoThumb({
  url, size = 48, className = '',
}: { url: string | null; size?: number; className?: string }) {
  if (url) {
    return (
      <img
        src={url} alt=""
        style={{ width: size, height: size }}
        className={`object-cover rounded-lg ${className}`}
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-lg bg-gray-100 flex items-center justify-center ${className}`}
    >
      <ImageOff className="h-5 w-5 text-gray-300" />
    </div>
  )
}

// ── Botón de upload de foto ────────────────────────────────────────────────────
function PhotoUploadButton({
  product, onUploaded, size = 'sm',
}: {
  product:    Product
  onUploaded: (url: string) => void
  size?:      'sm' | 'lg'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20_000_000) { toast.error('Foto máx. 20 MB'); return }
    setBusy(true)
    try {
      const dataUrl = await resizeImage(file, 1200)
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ photo_url: dataUrl }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al guardar la foto')
      }
      onUploaded(dataUrl)
      toast.success('Foto actualizada')
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Error al subir la foto'
      toast.error(msg)
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <>
      <button
        title="Subir foto" disabled={busy}
        onClick={() => ref.current?.click()}
        className={`flex items-center gap-1 text-gray-400 hover:text-violet-600 transition-colors
          ${size === 'lg' ? 'text-sm' : 'text-xs'}`}
      >
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Upload  className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        }
        {size === 'lg' && 'Subir foto'}
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </>
  )
}

// ── Modal de variantes ────────────────────────────────────────────────────────
function VariantsDialog({
  product, onClose,
}: { product: Product; onClose: () => void }) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch(`/api/products/${product.id}/variants`)
      .then(r => r.json())
      .then(setVariants)
      .catch(() => toast.error('Error al cargar variantes'))
      .finally(() => setLoading(false))
  }, [product.id])

  // Agrupar por color para mejor lectura
  const byColor = useMemo(() => {
    const map = new Map<string, Variant[]>()
    for (const v of variants) {
      if (!map.has(v.color)) map.set(v.color, [])
      map.get(v.color)!.push(v)
    }
    return map
  }, [variants])

  const statusCfg = {
    vendido:     { label: '✓ Vendido',     cls: 'text-green-700' },
    en_stock:    { label: '● En stock',    cls: 'text-emerald-600' },
    sin_asignar: { label: '○ Sin asignar', cls: 'text-gray-400' },
  }

  const totals = useMemo(() => ({
    vendido:     variants.filter(v => v.status === 'vendido').length,
    en_stock:    variants.filter(v => v.status === 'en_stock').length,
    sin_asignar: variants.filter(v => v.status === 'sin_asignar').length,
  }), [variants])

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Rows3 className="h-4 w-4 text-violet-600" />
            {product.name}
            <span className="text-sm font-normal text-gray-400 ml-1">
              — {product.variant_count} variante{product.variant_count !== 1 ? 's' : ''}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Resumen */}
        {!loading && variants.length > 0 && (
          <div className="flex gap-4 text-sm pb-2 border-b">
            <span className="text-emerald-700 font-medium">● {totals.en_stock} en stock</span>
            <span className="text-green-700 font-medium">✓ {totals.vendido} vendidas</span>
            {totals.sin_asignar > 0 && (
              <span className="text-gray-400">○ {totals.sin_asignar} sin asignar</span>
            )}
          </div>
        )}

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
            </div>
          ) : variants.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Sin variantes registradas</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b">
                  <th className="text-left px-2 py-2">Color / Talle</th>
                  <th className="text-left px-2 py-2">Estado</th>
                  <th className="text-left px-2 py-2 hidden sm:table-cell">Sucursal</th>
                  <th className="text-right px-2 py-2 hidden sm:table-cell">Fecha venta</th>
                  <th className="text-right px-2 py-2">Costo</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byColor.entries()).map(([color, vars], ci) =>
                  vars.map((v, vi) => (
                    <tr key={v.id}
                      className={`border-b border-gray-50 ${ci % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-2 py-1.5">
                        {vi === 0 && (
                          <span className="font-medium text-gray-700">{color}</span>
                        )}
                        <span className={`${vi === 0 ? 'ml-2' : ''} text-gray-500`}>
                          T.{v.size}
                        </span>
                      </td>
                      <td className={`px-2 py-1.5 font-medium text-xs ${statusCfg[v.status].cls}`}>
                        {statusCfg[v.status].label}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-500 hidden sm:table-cell">
                        {v.branch_name ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-400 text-right hidden sm:table-cell">
                        {v.sold_at ? fmtDate(v.sold_at) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-right tabular-nums text-gray-500">
                        {v.unit_cost ? fmt(v.unit_cost) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Tarjeta de producto (vista cuadrícula) ─────────────────────────────────────
// ── Historial del producto ────────────────────────────────────────────────────
const EVENT_CFG = {
  creacion:        { icon: Calendar,       cls: 'text-gray-400',   label: 'Creación'          },
  compra:          { icon: ShoppingCart,   cls: 'text-violet-500', label: 'Compra'            },
  venta:           { icon: Tag,            cls: 'text-green-500',  label: 'Venta'             },
  cambio_devuelto: { icon: ArrowLeftRight, cls: 'text-amber-500',  label: 'Cambio — devuelto' },
  cambio_recibido: { icon: ArrowLeftRight, cls: 'text-sky-500',    label: 'Cambio — entregado'},
} satisfies Record<HistoryEvent['type'], { icon: React.ElementType; cls: string; label: string }>

function ProductHistoryDialog({
  product, onClose,
}: { product: Product; onClose: () => void }) {
  const [events,  setEvents ] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/products/${product.id}/history`)
      .then(r => r.json())
      .then(setEvents)
      .catch(() => toast.error('Error al cargar historial'))
      .finally(() => setLoading(false))
  }, [product.id])

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-violet-500" />
            Historial — {product.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">Sin movimientos registrados.</p>
        ) : (
          <div className="overflow-y-auto pr-1 space-y-0">
            {events.map((ev, i) => {
              const cfg  = EVENT_CFG[ev.type]
              const Icon = cfg.icon
              const x    = ev.extra
              return (
                <div key={i} className="flex gap-3 py-3 border-b border-gray-50 last:border-0">
                  {/* icono + línea vertical */}
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    <div className={`rounded-full bg-gray-100 p-1.5 ${cfg.cls}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    {i < events.length - 1 && <div className="w-px flex-1 bg-gray-100" />}
                  </div>

                  {/* contenido */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                        {cfg.label}
                      </span>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                        {fmtDate(ev.date)}
                      </span>
                    </div>

                    {ev.type === 'creacion' && (
                      <p className="text-sm text-gray-700 mt-0.5">
                        Precio base: <span className="font-semibold text-violet-700">{fmt(ev.amount ?? 0)}</span>
                      </p>
                    )}

                    {ev.type === 'compra' && (
                      <>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {product.name} {ev.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {x.quantity} {x.quantity === 1 ? 'unidad' : 'unidades'} · Costo{' '}
                          <span className="font-semibold">{fmt(ev.amount ?? 0)}</span> c/u
                          {x.supplier ? ` · ${x.supplier}` : ''}
                          {x.title    ? ` · ${x.title}`    : ''}
                        </p>
                      </>
                    )}

                    {ev.type === 'venta' && (
                      <>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {ev.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Importe: <span className="font-semibold text-green-700">{fmt(ev.amount ?? 0)}</span>
                          {(x.discount ?? 0) > 0 && (
                            <> · Descuento: {fmt(x.discount!)} (total {fmt(x.total!)})</>
                          )}
                          {x.user   ? ` · ${x.user}`   : ''}
                          {x.branch ? ` · ${x.branch}` : ''}
                        </p>
                      </>
                    )}

                    {ev.type === 'cambio_devuelto' && (
                      <>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          Devolvió: {ev.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Precio original: <span className="font-semibold">{fmt(ev.amount ?? 0)}</span>
                          {x.new_variant ? ` · Recibió: ${x.new_variant}` : ''}
                          {(x.difference ?? 0) !== 0 && ` · Diferencia: ${fmt(x.difference!)}`}
                          {x.user   ? ` · ${x.user}`   : ''}
                          {x.branch ? ` · ${x.branch}` : ''}
                        </p>
                      </>
                    )}

                    {ev.type === 'cambio_recibido' && (
                      <>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          Entregado por cambio: {ev.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Precio: <span className="font-semibold">{fmt(ev.amount ?? 0)}</span>
                          {x.returned_variant ? ` · A cambio de: ${x.returned_variant}` : ''}
                          {(x.difference ?? 0) !== 0 && ` · Diferencia: ${fmt(x.difference!)}`}
                          {x.user   ? ` · ${x.user}`   : ''}
                          {x.branch ? ` · ${x.branch}` : ''}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ProductCard({
  product, onUpdate, onEdit, onVariants, onHistory,
}: {
  product:    Product
  onUpdate:   (patch: Partial<Product>) => void
  onEdit:     () => void
  onVariants: () => void
  onHistory:  () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handlePhotoClick = () => fileRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20_000_000) { toast.error('Foto máx. 20 MB'); return }
    setUploading(true)
    const prev = product.photo_url
    try {
      const dataUrl = await resizeImage(file, 1200)
      onUpdate({ photo_url: dataUrl })
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ photo_url: dataUrl }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al guardar la foto')
      }
      toast.success('Foto actualizada')
    } catch (err: unknown) {
      onUpdate({ photo_url: prev })
      const msg = err instanceof Error && err.message ? err.message : 'Error al subir la foto'
      toast.error(msg)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleRedesToggle = async (updates: Partial<Product>) => {
    onUpdate(updates)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(updates),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    } catch (err: unknown) {
      // revert: invert each boolean
      const revert = Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, !v])
      ) as Partial<Product>
      onUpdate(revert)
      toast.error((err as Error).message)
    }
  }

  const badges = [
    product.category_name, product.age_group_name,
    product.season_name,   product.gender_name,
  ].filter(Boolean)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
      {/* Foto */}
      <div className="relative aspect-square bg-gray-50 cursor-pointer group" onClick={handlePhotoClick}>
        {product.photo_url
          ? <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
              <ImageOff className="h-8 w-8" />
              <span className="text-xs">Sin foto</span>
            </div>
          )
        }
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
          {uploading
            ? <Loader2 className="h-8 w-8 text-white animate-spin" />
            : <Upload  className="h-8 w-8 text-white" />
          }
          {!uploading && <span className="text-white text-xs drop-shadow">JPG/PNG · máx. 20 MB</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">{product.name}</p>
          <p className="text-base font-bold text-violet-700 mt-0.5">{fmt(product.base_price)}</p>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map((b, i) => (
              <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{b}</span>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          {product.variant_count} var · {product.stock_count} en stock
        </p>

        <RedesToggle product={product} onToggle={handleRedesToggle} />

        <div className="flex gap-1 mt-auto">
          <Button variant="ghost" size="sm"
            className="gap-1 text-xs text-gray-500 hover:text-violet-700 h-7 px-1 flex-1 justify-start"
            onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          {product.variant_count > 0 && (
            <Button variant="ghost" size="sm"
              className="gap-1 text-xs text-gray-400 hover:text-violet-700 h-7 px-1 flex-1 justify-start"
              onClick={onVariants}>
              <Rows3 className="h-3.5 w-3.5" /> Variantes
            </Button>
          )}
          <Button variant="ghost" size="icon"
            className="h-7 w-7 text-gray-400 hover:text-violet-700 shrink-0"
            title="Ver historial" onClick={onHistory}>
            <History className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Fila de producto (vista lista) ────────────────────────────────────────────
function ProductRow({
  product, onUpdate, onEdit, onVariants, onHistory,
}: {
  product:    Product
  onUpdate:   (patch: Partial<Product>) => void
  onEdit:     () => void
  onVariants: () => void
  onHistory:  () => void
}) {
  const handleRedesToggle = async (updates: Partial<Product>) => {
    onUpdate(updates)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(updates),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    } catch (err: unknown) {
      const revert = Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [k, !v])
      ) as Partial<Product>
      onUpdate(revert)
      toast.error((err as Error).message)
    }
  }

  const badges = [
    product.category_name,  product.age_group_name,
    product.season_name,    product.gender_name,
  ].filter(Boolean)

  const anyActive = EXPORT_KEYS.some(k => product[k])

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <td className="pl-4 pr-2 py-2.5">
        <PhotoThumb url={product.photo_url} size={44} />
      </td>
      <td className="px-2 py-2.5">
        <p className="font-medium text-sm text-gray-900">{product.name}</p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {badges.map(b => (
              <span key={b} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">{b}</span>
            ))}
          </div>
        )}
      </td>
      <td className="px-2 py-2.5 text-sm font-semibold text-violet-700 whitespace-nowrap">
        {fmt(product.base_price)}
      </td>
      <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap hidden sm:table-cell">
        {product.stock_count} / {product.variant_count}
      </td>
      <td className="px-2 py-2.5">
        <RedesToggle product={product} onToggle={handleRedesToggle} compact />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          <PhotoUploadButton product={product} onUploaded={url => onUpdate({ photo_url: url })} />
          {product.variant_count > 0 && (
            <Button variant="ghost" size="icon"
              className="h-7 w-7 text-gray-400 hover:text-violet-700"
              title="Ver variantes" onClick={onVariants}>
              <Rows3 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon"
            className="h-7 w-7 text-gray-400 hover:text-violet-700"
            title="Ver historial" onClick={onHistory}>
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon"
            className="h-7 w-7 text-gray-400 hover:text-violet-700"
            title="Editar" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ── Fotos por color ───────────────────────────────────────────────────────────
/**
 * Sección del diálogo de edición que permite subir una foto por cada color
 * de las variantes del producto. La foto se asocia al color (no al talle),
 * de modo que en la Tienda al seleccionar un color cambia la imagen.
 */
function PhotosByColorSection({ productId }: { productId: number }) {
  const [colors,          setColors         ] = useState<string[]>([])
  const [colorImages,     setColorImages     ] = useState<Record<string, number>>({}) // color → imgId
  const [uploadingColor,  setUploadingColor  ] = useState<string | null>(null)
  const [deletingColor,   setDeletingColor   ] = useState<string | null>(null)
  const colorFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Cargar colores de variantes y fotos existentes
  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${productId}/variants`).then(r => r.json()),
      fetch(`/api/products/${productId}/images`).then(r => r.json()),
    ]).then(([variants, images]) => {
      const uniqueColors = [...new Set<string>(
        (variants as { color: string }[]).map(v => v.color).filter(Boolean)
      )]
      setColors(uniqueColors)

      const imgMap: Record<string, number> = {}
      for (const img of (images as { id: number; color: string | null }[])) {
        if (img.color) imgMap[img.color] = img.id
      }
      setColorImages(imgMap)
    }).catch(() => {})
  }, [productId])

  const handleColorPhoto = async (color: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20_000_000) { toast.error('Foto máx. 20 MB'); return }
    setUploadingColor(color)
    try {
      const dataUrl = await resizeImage(file, 1200)
      const res = await fetch(`/api/products/${productId}/images`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ color, photo_url: dataUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setColorImages(prev => ({ ...prev, [color]: data.id }))
      toast.success(`Foto de "${color}" guardada`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploadingColor(null)
      if (colorFileRefs.current[color]) colorFileRefs.current[color]!.value = ''
    }
  }

  const handleDeleteColorPhoto = async (color: string) => {
    const imgId = colorImages[color]
    if (!imgId) return
    setDeletingColor(color)
    try {
      await fetch(`/api/products/${productId}/images/${imgId}`, { method: 'DELETE' })
      setColorImages(prev => { const n = { ...prev }; delete n[color]; return n })
      toast.success(`Foto de "${color}" eliminada`)
    } catch {
      toast.error('Error al eliminar la foto')
    } finally {
      setDeletingColor(null)
    }
  }

  if (colors.length === 0) return null

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-semibold text-gray-600">Fotos por color</Label>
        <span className="text-[10px] text-gray-400">· En la Tienda cambia la imagen al elegir el color</span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {colors.map(color => {
          const imgId      = colorImages[color]
          const isUploading = uploadingColor === color
          const isDeleting  = deletingColor  === color
          const previewSrc  = imgId ? `/api/images/product-images/${imgId}` : null
          return (
            <div key={color} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 bg-gray-50">
              {/* Miniatura */}
              <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-white flex items-center justify-center shrink-0">
                {isUploading
                  ? <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
                  : previewSrc
                  ? <img src={previewSrc} alt={color} className="w-full h-full object-cover" />
                  : <Upload className="h-5 w-5 text-gray-300" />}
              </div>

              {/* Color + acciones */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{color}</p>
                <p className="text-[10px] text-gray-400">{previewSrc ? 'Foto cargada' : 'Sin foto'}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm"
                  className="h-7 text-xs gap-1 px-2"
                  disabled={isUploading || isDeleting}
                  onClick={() => colorFileRefs.current[color]?.click()}>
                  <Upload className="h-3 w-3" />
                  {previewSrc ? 'Cambiar' : 'Subir'}
                </Button>
                {previewSrc && (
                  <Button variant="ghost" size="sm"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                    disabled={isDeleting}
                    onClick={() => handleDeleteColorPhoto(color)}>
                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>

              <input
                type="file" accept="image/*" className="hidden"
                ref={el => { colorFileRefs.current[color] = el }}
                onChange={e => handleColorPhoto(color, e)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Diálogo de edición de producto ────────────────────────────────────────────
function EditProductDialog({
  product, categories, ageGroups, seasons, genders, onSaved, onClose,
}: {
  product:    Product
  categories: LookupItem[]
  ageGroups:  LookupItem[]
  seasons:    LookupItem[]
  genders:    LookupItem[]
  onSaved:    (p: Partial<Product>) => void
  onClose:    () => void
}) {
  const [name,        setName       ] = useState(product.name)
  const [description, setDescription] = useState(product.description ?? '')
  const [price,       setPrice      ] = useState(String(product.base_price))
  const [cuotas,      setCuotas     ] = useState(String(product.cuotas ?? 0))
  const [categoryId,  setCategoryId ] = useState(product.category_id  ? String(product.category_id)  : '__none__')
  const [ageGroupId,  setAgeGroupId ] = useState(product.age_group_id ? String(product.age_group_id) : '__none__')
  const [seasonId,    setSeasonId   ] = useState(product.season_id    ? String(product.season_id)    : '__none__')
  const [genderId,    setGenderId   ] = useState(product.gender_id    ? String(product.gender_id)    : '__none__')
  const [photoUrl,    setPhotoUrl   ] = useState(product.photo_url)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [saving,      setSaving     ] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiGenerated,  setAiGenerated ] = useState(false)
  const [aiInfo,       setAiInfo      ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20_000_000) { toast.error('Foto máx. 20 MB'); return }
    setPhotoUploading(true)
    try { setPhotoUrl(await resizeImage(file, 1200)) }
    catch { toast.error('Error al procesar la imagen') }
    finally { setPhotoUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        base_price: parseFloat(price) || 0,
        cuotas: parseInt(cuotas) || 0,
        category_id:  categoryId  !== '__none__' ? parseInt(categoryId)  : null,
        age_group_id: ageGroupId  !== '__none__' ? parseInt(ageGroupId)  : null,
        season_id:    seasonId    !== '__none__' ? parseInt(seasonId)    : null,
        gender_id:    genderId    !== '__none__' ? parseInt(genderId)    : null,
        photo_url: photoUrl,
      }
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Producto actualizado')
      onSaved(body)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally { setSaving(false) }
  }

  const generateDescription = async () => {
    if (!photoUrl) { toast.error('Cargá una imagen primero'); return }
    const modelo = (typeof localStorage !== 'undefined' ? localStorage.getItem('ai_modelo') : null) ?? 'claude-haiku-4-5-20251001'
    const estilo = (typeof localStorage !== 'undefined' ? localStorage.getItem('ai_estilo') : null) ?? 'comercial'
    setAiGenerating(true)
    try {
      const [meta, data] = photoUrl.split(',')
      const mimeType = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
      const categoryName = categories.find(c => String(c.id) === categoryId)?.name
      const res = await fetch('/api/generar-descripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagenBase64: data,
          mimeType,
          nombre: name,
          precio: price || undefined,
          categoria: categoryName,
          modelo,
          estilo,
          descripcionAnterior: aiGenerated ? description : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al generar descripción')
      }
      const result = await res.json()
      setDescription(result.descripcion)
      setAiGenerated(true)
      const modeloLabel = modelo.includes('haiku') ? 'Haiku' : 'Sonnet'
      const estiloLabels: Record<string, string> = { comercial: 'Comercial', descriptivo: 'Descriptivo', emocional: 'Emocional', minimalista: 'Minimalista' }
      setAiInfo(`${modeloLabel} · ${estiloLabels[estilo] ?? estilo}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : 'Error al generar descripción')
    } finally {
      setAiGenerating(false)
    }
  }

  const anyRedes = EXPORT_KEYS.some(k => product[k])

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-600" />
            Editar producto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Foto */}
          <div className="flex items-start gap-4">
            <div
              className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 overflow-hidden cursor-pointer hover:border-violet-300 transition-colors shrink-0"
              onClick={() => fileRef.current?.click()}
            >
              {photoUploading
                ? <Loader2 className="h-6 w-6 text-violet-500 animate-spin" />
                : photoUrl
                ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                : <div className="flex flex-col items-center gap-1 text-gray-400">
                    <Upload className="h-6 w-6" />
                    <span className="text-[10px]">Foto</span>
                  </div>
              }
            </div>
            <div className="space-y-1.5 flex-1">
              <p className="text-xs text-gray-500 font-medium">Foto del producto</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                  onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Subir imagen
                </Button>
                {photoUrl && (
                  <Button variant="ghost" size="sm" className="text-xs text-red-400 hover:text-red-600"
                    onClick={() => setPhotoUrl(null)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Quitar
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-gray-400">JPG/PNG · max 20 MB · se redimensiona a 1200×1200</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
            </div>
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Descripción</Label>
              <button
                type="button"
                onClick={generateDescription}
                disabled={aiGenerating || !photoUrl}
                title={!photoUrl ? 'Cargá una imagen primero' : undefined}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors
                  ${!photoUrl || aiGenerating
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-violet-600 hover:text-violet-700 hover:bg-violet-50 cursor-pointer'}`}
              >
                {aiGenerating
                  ? <><Loader2 className="h-3 w-3 animate-spin inline mr-0.5" />Generando...</>
                  : aiGenerated ? '✨ Regenerar' : '✨ Generar descripción'}
              </button>
            </div>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opcional"
              className="resize-none text-sm"
            />
            {aiInfo && (
              <p className="text-[11px] text-gray-400">Generado con {aiInfo}</p>
            )}
          </div>

          {/* Precio + Cuotas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Precio de lista ($)</Label>
              <Input type="number" min={0} step="0.01"
                value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cuotas sin interés</Label>
              <Input type="number" min={0} max={24} step="1"
                placeholder="0 = sin cuotas"
                value={cuotas} onChange={e => setCuotas(e.target.value)} />
            </div>
          </div>

          {/* Clasificación */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Categoría', value: categoryId, setter: setCategoryId, items: categories },
              { label: 'Edad',      value: ageGroupId, setter: setAgeGroupId, items: ageGroups  },
              { label: 'Temporada', value: seasonId,   setter: setSeasonId,   items: seasons    },
              { label: 'Género',    value: genderId,   setter: setGenderId,   items: genders    },
            ].map(({ label, value, setter, items }) => (
              <div key={label} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Select value={value} onValueChange={setter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__"><span className="italic text-gray-400">Sin asignar</span></SelectItem>
                    {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Redes */}
          <div className="flex items-center gap-3 py-1">
            <Label className="text-xs text-gray-500">Publicar en redes</Label>
            <span className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border font-medium
              ${anyRedes
                ? 'bg-violet-100 text-violet-700 border-violet-300'
                : 'bg-gray-50 text-gray-400 border-gray-200'
              }`}>
              {anyRedes ? <CheckCircle2 className="h-3.5 w-3.5"/> : <Circle className="h-3.5 w-3.5"/>}
              {anyRedes ? 'Activo en redes' : 'Sin publicar'}
            </span>
            <p className="text-[11px] text-gray-400">Usá el toggle Redes en la lista para activar.</p>
          </div>

          {/* ── Fotos por color ─────────────────────────────────────────────── */}
          <PhotosByColorSection productId={product.id} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════
export default function ProductsPanel() {
  const [categories, setCategories] = useState<LookupItem[]>([])
  const [ageGroups,  setAgeGroups ] = useState<LookupItem[]>([])
  const [seasons,    setSeasons   ] = useState<LookupItem[]>([])
  const [genders,    setGenders   ] = useState<LookupItem[]>([])

  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading ] = useState(true)
  const [hasMore,  setHasMore ] = useState(false)
  const [offset,   setOffset  ] = useState(0)

  const [q,            setQ           ] = useState('')
  const [debouncedQ,   setDebouncedQ  ] = useState('')
  const [sort,         setSort        ] = useState<SortKey>('name_asc')
  const [filterCat,    setFilterCat   ] = useState('__all__')
  const [filterAge,    setFilterAge   ] = useState('__all__')
  const [filterSeason, setFilterSeason] = useState('__all__')
  const [filterGender, setFilterGender] = useState('__all__')
  const [filterExport, setFilterExport] = useState('__all__')
  const [filterPhoto,  setFilterPhoto ] = useState('__all__')
  const [showFilters,  setShowFilters ] = useState(false)

  const [view,           setView          ] = useState<View>('grid')
  const [editTarget,     setEditTarget    ] = useState<Product | null>(null)
  const [variantsTarget, setVariantsTarget] = useState<Product | null>(null)
  const [historyTarget,  setHistoryTarget ] = useState<Product | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/age-groups').then(r => r.json()),
      fetch('/api/seasons').then(r    => r.json()),
      fetch('/api/genders').then(r    => r.json()),
    ]).then(([cats, ages, seas, gens]) => {
      setCategories(cats); setAgeGroups(ages)
      setSeasons(seas);    setGenders(gens)
    }).catch(() => toast.error('Error al cargar listas'))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const buildQS = useCallback((off: number) => {
    const qs = new URLSearchParams({ sort, offset: String(off), limit: '53' })
    if (debouncedQ)                qs.set('q',            debouncedQ)
    if (filterCat    !== '__all__') qs.set('category_id',  filterCat)
    if (filterAge    !== '__all__') qs.set('age_group_id', filterAge)
    if (filterSeason !== '__all__') qs.set('season_id',    filterSeason)
    if (filterGender !== '__all__') qs.set('gender_id',    filterGender)
    if (filterExport !== '__all__') qs.set('exportable',   filterExport)
    if (filterPhoto  === 'yes')     qs.set('has_photo',    'true')
    if (filterPhoto  === 'no')      qs.set('has_photo',    'false')
    return qs.toString()
  }, [debouncedQ, sort, filterCat, filterAge, filterSeason, filterGender, filterExport, filterPhoto])

  useEffect(() => {
    setLoading(true); setOffset(0)
    fetch(`/api/products?${buildQS(0)}`)
      .then(r => r.json())
      .then((data: Product[]) => {
        setProducts(data.slice(0, 52))
        setHasMore(data.length === 53)
      })
      .catch(() => toast.error('Error al cargar productos'))
      .finally(() => setLoading(false))
  }, [buildQS])

  const loadMore = async () => {
    const next = offset + 52
    setLoading(true)
    try {
      const data: Product[] = await fetch(`/api/products?${buildQS(next)}`).then(r => r.json())
      setProducts(prev => [...prev, ...data.slice(0, 52)])
      setHasMore(data.length === 53)
      setOffset(next)
    } catch { toast.error('Error al cargar más productos') }
    finally  { setLoading(false) }
  }

  const updateProduct = useCallback((id: number, patch: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    if (editTarget?.id === id) setEditTarget(prev => prev ? { ...prev, ...patch } : prev)
  }, [editTarget])

  const activeFilterCount = [
    filterCat !== '__all__', filterAge !== '__all__', filterSeason !== '__all__',
    filterGender !== '__all__', filterExport !== '__all__', filterPhoto !== '__all__',
  ].filter(Boolean).length

  const sinFotoActive = filterPhoto === 'no'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Cabecera ── */}
      <div className="bg-white border-b shadow-sm sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-violet-600 shrink-0" />
              <h1 className="text-xl font-bold text-gray-900">Productos</h1>
              {!loading && (
                <span className="text-sm text-gray-400">
                  {products.length}{hasMore ? '+' : ''} producto{products.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex border rounded-lg overflow-hidden">
              {([['grid', LayoutGrid], ['list', List]] as [View, React.ElementType][]).map(([v, Icon]) => (
                <button key={v} onClick={() => setView(v)}
                  className={`p-2 transition-colors ${view === v ? 'bg-violet-600 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {/* Búsqueda */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input className="pl-9 h-9 text-sm" placeholder="Buscar por nombre…"
                value={q} onChange={e => setQ(e.target.value)} />
              {q && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setQ('')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Botón rápido Sin foto */}
            <button
              onClick={() => setFilterPhoto(sinFotoActive ? '__all__' : 'no')}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium border transition-colors
                ${sinFotoActive
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
            >
              <ImageOff className="h-3.5 w-3.5" />
              Sin foto
            </button>

            {/* Orden */}
            <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 text-sm w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Nombre A→Z</SelectItem>
                <SelectItem value="name_desc">Nombre Z→A</SelectItem>
                <SelectItem value="price_asc">Precio ↑</SelectItem>
                <SelectItem value="price_desc">Precio ↓</SelectItem>
                <SelectItem value="stock_desc">Más stock</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtros toggle */}
            <Button variant="outline" size="sm"
              className={`gap-1.5 h-9 ${activeFilterCount > 0 ? 'border-violet-400 text-violet-700 bg-violet-50' : ''}`}
              onClick={() => setShowFilters(v => !v)}>
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="bg-violet-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          {/* Panel de filtros */}
          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pb-1">
              {[
                { label: 'Categoría', value: filterCat,    setter: setFilterCat,    items: categories },
                { label: 'Edad',      value: filterAge,    setter: setFilterAge,    items: ageGroups  },
                { label: 'Temporada', value: filterSeason, setter: setFilterSeason, items: seasons    },
                { label: 'Género',    value: filterGender, setter: setFilterGender, items: genders    },
              ].map(({ label, value, setter, items }) => (
                <div key={label}>
                  <Select value={value} onValueChange={setter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={label} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__"><span className="italic text-gray-400">{label} (todos)</span></SelectItem>
                      {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Select value={filterExport} onValueChange={setFilterExport}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Canal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__"><span className="italic text-gray-400">Canal (todos)</span></SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPhoto} onValueChange={setFilterPhoto}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Foto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__"><span className="italic text-gray-400">Foto (todas)</span></SelectItem>
                  <SelectItem value="yes">Con foto</SelectItem>
                  <SelectItem value="no">Sin foto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading && products.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" /> Cargando productos…
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <Package className="h-12 w-12 text-gray-300" />
            <p className="font-medium text-gray-500">No hay productos con esos filtros</p>
            {(q || activeFilterCount > 0 || sinFotoActive) && (
              <Button variant="outline" size="sm" onClick={() => {
                setQ(''); setFilterCat('__all__'); setFilterAge('__all__')
                setFilterSeason('__all__'); setFilterGender('__all__')
                setFilterExport('__all__'); setFilterPhoto('__all__')
              }}>
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {products.map(p => (
              <ProductCard
                key={p.id} product={p}
                onUpdate={patch => updateProduct(p.id, patch)}
                onEdit={() => setEditTarget(p)}
                onVariants={() => setVariantsTarget(p)}
                onHistory={() => setHistoryTarget(p)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="pl-4 pr-2 py-2.5 w-12" />
                  <th className="px-2 py-2.5 text-left">Producto</th>
                  <th className="px-2 py-2.5 text-left">Precio</th>
                  <th className="px-2 py-2.5 text-left hidden sm:table-cell">Stock</th>
                  <th className="px-2 py-2.5 text-left">Redes</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <ProductRow
                    key={p.id} product={p}
                    onUpdate={patch => updateProduct(p.id, patch)}
                    onEdit={() => setEditTarget(p)}
                    onVariants={() => setVariantsTarget(p)}
                    onHistory={() => setHistoryTarget(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" onClick={loadMore} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Cargar más
            </Button>
          </div>
        )}
      </div>

      {/* Diálogo de edición */}
      {editTarget && (
        <EditProductDialog
          product={editTarget} categories={categories} ageGroups={ageGroups}
          seasons={seasons} genders={genders}
          onSaved={patch => { updateProduct(editTarget.id, patch); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Diálogo de variantes */}
      {variantsTarget && (
        <VariantsDialog product={variantsTarget} onClose={() => setVariantsTarget(null)} />
      )}

      {/* Diálogo de historial */}
      {historyTarget && (
        <ProductHistoryDialog product={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </div>
  )
}
