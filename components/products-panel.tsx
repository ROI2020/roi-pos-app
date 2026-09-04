"use client"

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react"
import {
  LayoutGrid, List, Search, SlidersHorizontal, Pencil, Upload,
  ImageOff, Loader2, X, ChevronDown, Package, Plus, Rows3,
  Globe, CheckCircle2, Circle, History, Calendar, ShoppingCart,
  Tag, ArrowLeftRight, Truck, RefreshCw, ExternalLink, Trash2, AlertTriangle,
  ShoppingBag, Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { useAdminCurrency } from "@/hooks/use-admin-currency"
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
import { toProxyUrl } from "@/lib/proxy-image"

// ── Types ──────────────────────────────────────────────────────────────────────
interface LookupItem  { id: number; name: string }

interface Product {
  id:           number
  name:         string
  long_name:    string | null  // nombre completo CJ (null para físicos)
  description:  string | null
  base_price:   number
  cuotas:       number
  photo_url:    string | null
  // DS / Dropshipping (CJ)
  cj_pid:           string | null   // no null = producto DS
  cj_cost_usd:      number | null   // costo en USD desde CJ
  markup_pct:       number | null
  general_image_url: string | null  // imagen CDN de CJ
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
  ml_item_id:    string | null
  ml_status:     string | null
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

/** Formato USD simple para costos CJ — siempre USD, sin depender de la moneda del negocio */
const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
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

// ── Botón ML en card ──────────────────────────────────────────────────────────
function MLCardButton({
  product,
  onUpdate,
}: {
  product:  Product
  onUpdate: (patch: Partial<Product>) => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [syncing,   setSyncing  ] = useState(false)

  const isPublished = Boolean(product.ml_item_id)
  const isPaused    = product.ml_status === 'paused'

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setSyncing(true)
    try {
      const res = await fetch('/api/ml/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productId: product.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Stock sincronizado con ML')
    } catch (err) {
      toast.error(`ML: ${String(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  if (isPublished) {
    return (
      <button
        onClick={handleSync}
        disabled={syncing}
        title={
          isPaused
            ? 'Publicación pausada — clic para re-sincronizar stock'
            : 'Publicado en ML — clic para sincronizar stock'
        }
        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border transition-all
          ${isPaused
            ? 'bg-orange-50 text-orange-600 border-orange-300 hover:bg-orange-100'
            : 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100'
          }`}
      >
        {syncing
          ? <Loader2     className="h-3.5 w-3.5 animate-spin shrink-0" />
          : <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
        }
        <span className="truncate">{isPaused ? 'ML Pausado' : 'Publicado ML'}</span>
        {!syncing && <RefreshCw className="h-3 w-3 ml-auto shrink-0 opacity-50" />}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowModal(true) }}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border transition-all
          bg-white text-gray-300 border-gray-200 hover:border-yellow-300 hover:text-yellow-700 hover:bg-yellow-50"
      >
        <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
        Publicar en ML
      </button>
      {showModal && (
        <MLPublishModal
          product={product}
          onClose={() => setShowModal(false)}
          onPublished={(result) => {
            onUpdate({ ml_item_id: result.mlItemId, ml_status: 'active' } as Partial<Product>)
            setShowModal(false)
            toast.success(`Publicado en ML: ${result.mlItemId}`)
          }}
        />
      )}
    </>
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
  const { fmt } = useAdminCurrency()
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
  const { fmt } = useAdminCurrency()
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
  product, onUpdate, onEdit, onVariants, onHistory, onDelete,
}: {
  product:    Product
  onUpdate:   (patch: Partial<Product>) => void
  onEdit:     () => void
  onVariants: () => void
  onHistory:  () => void
  onDelete:   () => void
}) {
  const { fmt } = useAdminCurrency()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading,       setUploading      ] = useState(false)
  const [confirmDelete,   setConfirmDelete  ] = useState(false)

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

  const isDS   = Boolean(product.cj_pid)
  // Para DS: mostrar imagen CJ proxied; para físicos: foto local
  const imgSrc = isDS
    ? toProxyUrl(product.general_image_url)
    : product.photo_url

  return (
    <div className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col
      ${isDS ? 'border-sky-200' : 'border-gray-200'}`}>
      {/* Foto */}
      <div
        className={`relative aspect-square bg-gray-50 ${isDS ? '' : 'cursor-pointer group'}`}
        onClick={isDS ? undefined : handlePhotoClick}
      >
        {imgSrc
          ? <img src={imgSrc} alt={product.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
              <ImageOff className="h-8 w-8" />
              <span className="text-xs">Sin foto</span>
            </div>
          )
        }
        {/* Badge DS */}
        {isDS && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-sky-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow">
            <Truck className="h-2.5 w-2.5" /> DS
          </span>
        )}
        {!isDS && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
            {uploading
              ? <Loader2 className="h-8 w-8 text-white animate-spin" />
              : <Upload  className="h-8 w-8 text-white" />
            }
            {!uploading && <span className="text-white text-xs drop-shadow">JPG/PNG · máx. 20 MB</span>}
          </div>
        )}
        {!isDS && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">{product.name}</p>
          <p className="text-base font-bold text-violet-700 mt-0.5">{fmt(product.base_price)}</p>
          {isDS && product.cj_cost_usd != null && (
            <p className="text-[10px] text-sky-600 mt-0.5">
              Costo CJ: {fmtUsd(product.cj_cost_usd)}
              {product.markup_pct != null && <span className="text-gray-400 ml-1">· {product.markup_pct}% markup</span>}
            </p>
          )}
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map((b, i) => (
              <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{b}</span>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          {product.variant_count} var
          {!isDS && ` · ${product.stock_count} en stock`}
        </p>

        <RedesToggle product={product} onToggle={handleRedesToggle} />

        {/* Botón ML — solo para productos físicos */}
        {!isDS && (
          <MLCardButton product={product} onUpdate={onUpdate} />
        )}

        {/* Acciones — icono arriba + texto abajo */}
        <div className="flex mt-auto border-t border-gray-100 pt-1 -mx-3 px-1">
          <button
            onClick={onEdit}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-500 hover:text-violet-700 hover:bg-violet-50 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            <span className="text-[9px] font-medium leading-none">
              {isDS ? 'Ver/Editar' : 'Editar'}
            </span>
          </button>

          {!isDS && product.variant_count > 0 && (
            <button
              onClick={onVariants}
              className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-400 hover:text-violet-700 hover:bg-violet-50 transition-colors"
            >
              <Rows3 className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">Variantes</span>
            </button>
          )}

          {!isDS && (
            <button
              onClick={onHistory}
              className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-400 hover:text-violet-700 hover:bg-violet-50 transition-colors"
            >
              <History className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">Historial</span>
            </button>
          )}

          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-red-50 text-red-600"
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[9px] font-bold leading-none">¿Confirmar?</span>
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">Borrar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fila de producto (vista lista) ────────────────────────────────────────────
function ProductRow({
  product, onUpdate, onEdit, onVariants, onHistory, onDelete,
}: {
  product:    Product
  onUpdate:   (patch: Partial<Product>) => void
  onEdit:     () => void
  onVariants: () => void
  onHistory:  () => void
  onDelete:   () => void
}) {
  const { fmt } = useAdminCurrency()
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  const isDS   = Boolean(product.cj_pid)
  const imgSrc = isDS
    ? toProxyUrl(product.general_image_url)
    : product.photo_url

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <td className="pl-4 pr-2 py-2.5">
        <div className="relative">
          <PhotoThumb url={imgSrc} size={44} />
          {isDS && (
            <span className="absolute -top-1 -right-1 flex items-center bg-sky-600 text-white text-[8px] font-bold px-1 py-0.5 rounded-full">
              DS
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-2.5">
        <p className="font-medium text-sm text-gray-900">{product.name}</p>
        {isDS && product.cj_cost_usd != null && (
          <p className="text-[10px] text-sky-600">
            Costo: {fmtUsd(product.cj_cost_usd)}
            {product.markup_pct != null && <span className="text-gray-400"> · {product.markup_pct}% markup</span>}
          </p>
        )}
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
        {isDS ? `${product.variant_count} var` : `${product.stock_count} / ${product.variant_count}`}
      </td>
      <td className="px-2 py-2.5">
        <RedesToggle product={product} onToggle={handleRedesToggle} compact />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          {!isDS && <PhotoUploadButton product={product} onUploaded={url => onUpdate({ photo_url: url })} />}
          {!isDS && product.variant_count > 0 && (
            <Button variant="ghost" size="icon"
              className="h-7 w-7 text-gray-400 hover:text-violet-700"
              title="Ver variantes" onClick={onVariants}>
              <Rows3 className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isDS && (
            <Button variant="ghost" size="icon"
              className="h-7 w-7 text-gray-400 hover:text-violet-700"
              title="Ver historial" onClick={onHistory}>
              <History className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon"
            className="h-7 w-7 text-gray-400 hover:text-violet-700"
            title="Editar" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {/* Borrar */}
          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="text-[10px] font-bold text-red-600 border border-red-300 rounded px-1.5 py-0.5 bg-red-50 hover:bg-red-100 whitespace-nowrap"
            >
              ¿Sí?
            </button>
          ) : (
            <Button variant="ghost" size="icon"
              className="h-7 w-7 text-gray-300 hover:text-red-500"
              title="Borrar producto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
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

// ── Diálogo de edición de producto DS (Dropshipping CJ) ──────────────────────
/**
 * Abre el mismo layout que el modal de importación CJ pero en modo edición.
 * Permite editar name, long_name, markup y precio.
 * El botón "Actualizar desde CJ" hace un sync individual del producto.
 */
function DSEditDialog({
  product, onSaved, onClose, onDelete,
}: {
  product:  Product
  onSaved:  (p: Partial<Product>) => void
  onClose:  () => void
  onDelete: () => void
}) {
  const { fmt } = useAdminCurrency()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cjData,    setCjData   ] = useState<Record<string, any> | null>(null)
  const [nameEdit,  setNameEdit ] = useState(product.name)
  const [longEdit,  setLongEdit ] = useState(product.long_name ?? product.name)
  const [markup,    setMarkup   ] = useState(String(product.markup_pct ?? 30))
  const [price,     setPrice    ] = useState(String(product.base_price))
  const [saving,         setSaving        ] = useState(false)
  const [syncing,        setSyncing       ] = useState(false)
  const [loadingData,    setLoadingData   ] = useState(true)
  const [confirmDelete,  setConfirmDelete ] = useState(false)
  // Exportable channels — local state para toggle inmediato
  const [exportWeb,      setExportWeb     ] = useState(product.exportable_web)
  const [exportWa,       setExportWa      ] = useState(product.exportable_whatsapp)
  const [exportIg,       setExportIg      ] = useState(product.exportable_instagram)
  const [exportFb,       setExportFb      ] = useState(product.exportable_facebook)

  useEffect(() => {
    // Cargar cj_data del producto desde la API
    fetch(`/api/products/${product.id}`)
      .then(r => r.json())
      .then(d => { if (d.cj_data) setCjData(d.cj_data) })
      .catch(() => {})
      .finally(() => setLoadingData(false))
  }, [product.id])

  const images: string[] = cjData?.productImages ?? (cjData?.productImage ? [cjData.productImage] : [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const markupPct = parseFloat(markup) || 0
      const cjCost    = product.cj_cost_usd ?? 0
      const newPrice  = parseFloat(price) || (cjCost * (1 + markupPct / 100))
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       nameEdit.trim(),
          long_name:  longEdit.trim() || null,
          markup_pct: markupPct,
          base_price: newPrice,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Producto actualizado')
      onSaved({ name: nameEdit.trim(), long_name: longEdit.trim() || null, markup_pct: markupPct, base_price: newPrice })
    } catch (err) {
      toast.error(String(err))
    } finally { setSaving(false) }
  }

  const handleSyncOne = async () => {
    if (!product.cj_pid) return
    setSyncing(true)
    try {
      const res = await fetch(`/api/admin/cj/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error al sincronizar')
      const data = await res.json()
      toast.success('Producto actualizado desde CJ')
      // Refrescar cj_data local
      fetch(`/api/products/${product.id}`)
        .then(r => r.json())
        .then(d => { if (d.cj_data) setCjData(d.cj_data); if (d.cj_cost_usd) onSaved({ cj_cost_usd: d.cj_cost_usd }) })
        .catch(() => {})
      if (data.newPrice) { setPrice(String(data.newPrice)); onSaved({ base_price: data.newPrice }) }
    } catch (err) {
      toast.error(String(err))
    } finally { setSyncing(false) }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-sky-600" />
            Editar producto DS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Galería de imágenes CJ */}
          {loadingData ? (
            <div className="flex items-center justify-center h-20 text-gray-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando datos CJ…
            </div>
          ) : images.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.slice(0, 6).map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i} src={img} alt={`Vista ${i + 1}`}
                  className="w-20 h-20 object-cover rounded-lg flex-shrink-0 border"
                />
              ))}
            </div>
          ) : null}

          {/* Info CJ */}
          {cjData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="bg-sky-50 rounded-lg p-2.5">
                <p className="text-xs text-sky-500">Costo CJ</p>
                <p className="font-bold text-sky-800">{fmtUsd(product.cj_cost_usd ?? 0)}</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-2.5">
                <p className="text-xs text-violet-500">Precio venta</p>
                <p className="font-bold text-violet-800">{fmt(product.base_price)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-400">Popularidad</p>
                <p className="font-bold text-gray-900 flex items-center gap-1">
                  {cjData.listedNum?.toLocaleString('es-AR') ?? '—'}
                  <span className="text-[9px] font-normal text-gray-400">tiendas</span>
                </p>
              </div>
              <div className={`rounded-lg p-2.5 ${
                cjData.productStatus === 3 ? 'bg-green-50' :
                cjData.productStatus === 2 ? 'bg-red-50' : 'bg-amber-50'
              }`}>
                <p className="text-xs text-gray-400">Estado CJ</p>
                <p className={`font-bold text-sm ${
                  cjData.productStatus === 3 ? 'text-green-700' :
                  cjData.productStatus === 2 ? 'text-red-700' : 'text-amber-700'
                }`}>
                  {cjData.productStatus === 3 ? '● On Sale' :
                   cjData.productStatus === 2 ? '● Off Sale' :
                   `? Status ${cjData.productStatus}`}
                </p>
              </div>
            </div>
          )}

          {/* Nombres */}
          <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombres</p>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Nombre corto <span className="text-gray-400 font-normal">(visible en tienda)</span>
              </Label>
              <Input
                value={nameEdit}
                onChange={e => setNameEdit(e.target.value)}
                maxLength={150}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Nombre completo CJ <span className="text-gray-400 font-normal">(se muestra debajo del nombre cuando difiere)</span>
              </Label>
              <Input
                value={longEdit}
                onChange={e => setLongEdit(e.target.value)}
                maxLength={300}
                className="text-sm text-gray-600"
              />
            </div>
          </div>

          {/* Markup y precio */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Markup sobre costo CJ
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={500}
                  value={markup}
                  onChange={e => {
                    setMarkup(e.target.value)
                    const pct  = parseFloat(e.target.value) || 0
                    const cost = product.cj_cost_usd ?? 0
                    if (cost > 0) setPrice((cost * (1 + pct / 100)).toFixed(2))
                  }}
                  className="w-24 text-sm"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Precio de lista
              </Label>
              <Input
                type="number" min={0} step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Canales de exposición */}
          {(() => {
            const channels = [
              { key: 'web',       label: 'Web',       val: exportWeb, set: setExportWeb },
              { key: 'whatsapp',  label: 'WhatsApp',  val: exportWa,  set: setExportWa  },
              { key: 'instagram', label: 'Instagram', val: exportIg,  set: setExportIg  },
              { key: 'facebook',  label: 'Facebook',  val: exportFb,  set: setExportFb  },
            ]
            const handleChannelToggle = async (k: string, newVal: boolean) => {
              const fieldKey = `exportable_${k}` as keyof Product
              const patch: Partial<Product> = { [fieldKey]: newVal } as Partial<Product>
              try {
                const res = await fetch(`/api/products/${product.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(patch),
                })
                if (!res.ok) throw new Error((await res.json()).error)
                onSaved(patch)
              } catch (err) {
                toast.error(String(err))
              }
            }
            return (
              <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Exponer en canales
                </p>
                <div className="flex flex-wrap gap-2">
                  {channels.map(ch => (
                    <button
                      key={ch.key}
                      onClick={() => {
                        ch.set(!ch.val)
                        handleChannelToggle(ch.key, !ch.val)
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        ch.val
                          ? 'bg-violet-100 text-violet-700 border-violet-300'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Mercado Libre — solo productos físicos (sin cj_pid) */}
          {!product.cj_pid && (
            <MLPublishSection product={product} />
          )}

          {/* PID */}
          {product.cj_pid && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-400 mb-1">CJ Product ID</p>
              <code className="text-xs font-mono text-gray-700 break-all select-all">{product.cj_pid}</code>
              <a
                href={`https://app.cjdropshipping.com/product-detail.html?id=${product.cj_pid}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 ml-3 text-xs text-violet-600 hover:underline"
              >
                Ver en CJ <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" className="gap-1.5 text-sky-600 border-sky-200 hover:bg-sky-50"
              onClick={handleSyncOne} disabled={syncing || saving}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Actualizar desde CJ
            </Button>
            {/* Borrar */}
            {confirmDelete ? (
              <button
                onClick={onDelete}
                className="text-xs font-bold text-red-600 border border-red-300 rounded-md px-3 py-1.5 bg-red-50 hover:bg-red-100 flex items-center gap-1.5"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> ¿Confirmar borrado?
              </button>
            ) : (
              <Button
                variant="ghost" size="sm"
                className="gap-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Borrar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// ML: Sección + Modal de publicación en MercadoLibre
// ══════════════════════════════════════════════════════════════════════════════

interface MLCategory {
  categoryId:   string
  categoryName: string
  domainName:   string
  predictedAttributes: Array<{ id: string; name: string; value: string }>
}

const LISTING_TYPES = [
  { value: 'gold_special', label: 'Clásica',  desc: '~8% comisión · visibilidad media' },
  { value: 'gold_pro',     label: 'Premium',  desc: '~15% comisión · alta visibilidad · envío gratis obligatorio' },
  { value: 'free',         label: 'Gratuita', desc: 'Sin comisión · muy baja visibilidad' },
]

function MLPublishSection({ product }: { product: Product }) {
  const [open,       setOpen      ] = useState(false)
  const [mlStatus,   setMLStatus  ] = useState<{ mlItemId: string; permalink: string } | null>(null)
  const [checking,   setChecking  ] = useState(false)

  // Verificar si ya está publicado en ML
  useEffect(() => {
    setChecking(true)
    fetch(`/api/ml/items?productId=${product.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Array<{ ml_item_id: string; ml_status: string }> | null) => {
        if (data?.length) {
          setMLStatus({ mlItemId: data[0].ml_item_id, permalink: `https://articulo.mercadolibre.com.ar/${data[0].ml_item_id}` })
        }
      })
      .catch(() => {/* ML no configurado — silencioso */})
      .finally(() => setChecking(false))
  }, [product.id])

  return (
    <div className="border rounded-lg p-3 bg-yellow-50 border-yellow-200 space-y-2">
      <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wide flex items-center gap-1.5">
        <ShoppingBag className="h-3.5 w-3.5" /> MercadoLibre
      </p>
      {checking ? (
        <div className="flex items-center gap-1.5 text-xs text-yellow-600">
          <Loader2 className="h-3 w-3 animate-spin" /> Verificando…
        </div>
      ) : mlStatus ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            ● Publicado · {mlStatus.mlItemId}
          </span>
          <a
            href={mlStatus.permalink}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-yellow-700 underline flex items-center gap-1"
          >
            Ver en ML <ExternalLink className="h-3 w-3" />
          </a>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-yellow-700 underline"
          >
            Republicar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          Publicar en MercadoLibre
        </button>
      )}

      {open && (
        <MLPublishModal
          product={product}
          onClose={() => setOpen(false)}
          onPublished={(result) => {
            setMLStatus(result)
            setOpen(false)
            toast.success(`Publicado en ML: ${result.mlItemId}`)
          }}
        />
      )}
    </div>
  )
}

interface MLFeeData {
  fee:      number
  pct:      number   // fracción: 0.08 = 8%
  net:      number
  currency: string
}

interface MLRequiredAttr {
  id:         string
  name:       string
  values:     Array<{ id: string; name: string }>
  value_type: string
}

/**
 * Mapea género+edad de ROIPOS a los valores exactos que usa ML.
 * Todos los age_groups son infantiles (Bebés, Peques, Kids, Teens)
 * → siempre cae en la rama kids de ML.
 */
function mapGenderToML(genderName: string | null, _ageGroupName: string | null): string {
  switch (genderName) {
    case 'Varón':  return 'Niños'
    case 'Nena':   return 'Niñas'
    case 'Unisex': return 'Sin género infantil'
    default:       return ''
  }
}

function MLPublishModal({
  product, onClose, onPublished,
}: {
  product:     Product
  onClose:     () => void
  onPublished: (r: { mlItemId: string; permalink: string }) => void
}) {
  const { fmt } = useAdminCurrency()

  // Query enriquecido con metadatos del producto para mejor predicción de categoría ML
  // age_group_name puede venir como "Bebés | 0-24 meses" → tomamos solo el nombre principal
  const ageLabel = product.age_group_name?.split('|')[0].trim() ?? null
  const enrichedQuery = [
    product.name,
    ageLabel,
    product.gender_name,
    product.season_name,
  ].filter(Boolean).join(' - ')

  const [searchQuery,    setSearchQuery   ] = useState(enrichedQuery)
  const [searching,      setSearching     ] = useState(false)
  const [categories,     setCategories    ] = useState<MLCategory[]>([])
  const [selCategory,    setSelCategory   ] = useState<MLCategory | null>(null)
  const [listingType,    setListingType   ] = useState<string>('gold_special')
  const [publishing,     setPublishing    ] = useState(false)
  const [searched,       setSearched      ] = useState(false)
  const [feeData,        setFeeData       ] = useState<MLFeeData | null>(null)
  const [loadingFee,     setLoadingFee    ] = useState(false)
  const [reqAttrs,       setReqAttrs      ] = useState<MLRequiredAttr[]>([])
  const [attrValues,     setAttrValues    ] = useState<Record<string, string>>({})

  // Cargar atributos requeridos cuando cambia la categoría
  useEffect(() => {
    if (!selCategory) { setReqAttrs([]); setAttrValues({}); return }
    fetch(`/api/ml/category-attributes?categoryId=${selCategory.categoryId}`)
      .then(r => r.json())
      .then((attrs: MLRequiredAttr[] | { error?: string }) => {
        if (!Array.isArray(attrs)) return
        setReqAttrs(attrs)
        // Pre-llenar valores derivados del producto (el usuario puede editarlos)
        const prefill: Record<string, string> = {}
        attrs.forEach(a => {
          if (a.id === 'MODEL') prefill[a.id] = product.name
          if (a.id === 'BRAND') prefill[a.id] = 'GENERICO'
          if (a.id === 'GENDER') {
            const g = mapGenderToML(product.gender_name, product.age_group_name)
            if (g) prefill[a.id] = g
          }
        })
        setAttrValues(prev => ({ ...prefill, ...prev }))
      })
      .catch(() => {/* silencioso */})
  }, [selCategory, product.name, product.gender_name, product.age_group_name])

  // Actualizar fee preview cada vez que cambia categoría o tipo de publicación
  useEffect(() => {
    if (!selCategory) { setFeeData(null); return }
    const ctrl = new AbortController()
    setFeeData(null)
    setLoadingFee(true)
    const qs = new URLSearchParams({
      categoryId:    selCategory.categoryId,
      listingTypeId: listingType,
      price:         String(product.base_price),
    })
    fetch(`/api/ml/listing-prices?${qs}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((d: MLFeeData & { error?: string }) => {
        if (!d.error) setFeeData(d)
      })
      .catch(() => {/* silencioso si abort o ML no configurado */})
      .finally(() => setLoadingFee(false))
    return () => ctrl.abort()
  }, [selCategory, listingType, product.base_price])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setCategories([])
    setSelCategory(null)
    setSearched(false)
    try {
      const res  = await fetch(`/api/ml/categories?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json() as { categories?: MLCategory[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error buscando categorías')
      setCategories(data.categories ?? [])
      setSearched(true)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSearching(false)
    }
  }

  const handlePublish = async () => {
    if (!selCategory) { toast.error('Seleccioná una categoría'); return }

    // Validar que todos los atributos requeridos tengan valor
    const missing = reqAttrs.filter(a => !attrValues[a.id]?.trim())
    if (missing.length) {
      toast.error(`Completá: ${missing.map(a => a.name).join(', ')}`)
      return
    }

    // Construir extraAttributes desde los valores ingresados
    const extraAttributes = reqAttrs
      .filter(a => attrValues[a.id]?.trim())
      .map(a => ({ id: a.id, value_name: attrValues[a.id].trim() }))

    setPublishing(true)
    try {
      const res  = await fetch('/api/ml/items', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId:   product.id,
          categoryId:  selCategory.categoryId,
          listingType,
          condition:   'new',
          extraAttributes,
        }),
      })
      const data = await res.json() as { mlItemId?: string; permalink?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al publicar')
      onPublished({ mlItemId: data.mlItemId!, permalink: data.permalink! })
    } catch (err) {
      toast.error(String(err))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-yellow-600" />
            Publicar en MercadoLibre
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Buscador de categoría */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              ML sugiere la categoría según el título
            </Label>
            <p className="text-xs text-gray-500">
              Editá el título para refinar la búsqueda y que ML elija la categoría más precisa.
            </p>
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Ej: Remera básica mujer talle M"
                className="text-sm flex-1"
              />
              <Button
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                size="sm"
                variant="outline"
              >
                {searching
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Resultados de categorías */}
          {searched && categories.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-3">
              Sin resultados. Probá con otro término.
            </p>
          )}

          {categories.length > 0 && (
            <div className="space-y-2">
              <Label>Seleccioná la categoría correcta</Label>
              <div className="space-y-1.5">
                {categories.map(cat => (
                  <button
                    key={cat.categoryId}
                    onClick={() => setSelCategory(cat)}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                      selCategory?.categoryId === cat.categoryId
                        ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="font-medium text-gray-800">{cat.categoryName}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{cat.domainName} · {cat.categoryId}</div>
                    {cat.predictedAttributes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {cat.predictedAttributes.slice(0, 4).map(a => (
                          <span key={a.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {a.name}: {a.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tipo de publicación */}
          {selCategory && (
            <div className="space-y-2 border-t pt-4">
              <Label>Tipo de publicación</Label>
              <div className="space-y-1.5">
                {LISTING_TYPES.map(lt => (
                  <button
                    key={lt.value}
                    onClick={() => setListingType(lt.value)}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                      listingType === lt.value
                        ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="font-medium text-gray-800">{lt.label}</div>
                    <div className="text-xs text-gray-500">{lt.desc}</div>
                  </button>
                ))}
              </div>

              {/* Atributos requeridos por la categoría */}
              {reqAttrs.length > 0 && (
                <div className="space-y-2 border rounded-lg p-3 bg-amber-50 border-amber-200">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Datos requeridos por ML para esta categoría
                  </p>
                  {reqAttrs.map(attr => {
                    // BRAND: siempre texto libre — ML acepta cualquier valor
                    const forceText = attr.id === 'BRAND'
                    return (
                      <div key={attr.id} className="space-y-1">
                        <label className="text-xs font-medium text-gray-700">
                          {attr.name}
                          {attr.id === 'BRAND' && (
                            <span className="ml-1 text-gray-400 font-normal">(podés escribir la marca o dejar GENERICO)</span>
                          )}
                        </label>
                        {!forceText && attr.values.length > 0 ? (
                          <select
                            value={attrValues[attr.id] ?? ''}
                            onChange={e => setAttrValues(prev => ({ ...prev, [attr.id]: e.target.value }))}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white"
                          >
                            <option value="">Seleccioná {attr.name}…</option>
                            {attr.values.map(v => (
                              <option key={v.id} value={v.name}>{v.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={attrValues[attr.id] ?? ''}
                            onChange={e => setAttrValues(prev => ({ ...prev, [attr.id]: e.target.value }))}
                            placeholder={`Ingresá ${attr.name}`}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Resumen + Fee preview */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1 border mt-2">
                <p><span className="font-medium">Producto:</span> {product.name}</p>
                <p><span className="font-medium">Categoría:</span> {selCategory.categoryName} ({selCategory.categoryId})</p>
                <p>
                  <span className="font-medium">Tipo:</span>{' '}
                  {LISTING_TYPES.find(l => l.value === listingType)?.label}
                </p>
                <p><span className="font-medium">Precio a publicar:</span> {fmt(product.base_price)}</p>

                {/* Fee breakdown */}
                <div className="border-t border-gray-200 mt-2 pt-2">
                  {loadingFee ? (
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Calculando comisión ML…
                    </span>
                  ) : feeData ? (
                    <div className="space-y-1">
                      <p className="text-amber-700">
                        <span className="font-medium">Comisión ML:</span>{' '}
                        {fmt(feeData.fee)}{' '}
                        <span className="text-amber-500">
                          ({(feeData.pct * 100).toFixed(0)}%)
                        </span>
                      </p>
                      <p className="text-green-700 font-semibold text-sm">
                        Ganancia neta: {fmt(feeData.net)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">
                      Fee no disponible para esta combinación
                    </span>
                  )}
                </div>
              </div>

              <Button
                onClick={handlePublish}
                disabled={publishing}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold border-0"
              >
                {publishing
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Publicando…</>
                  : <><ShoppingBag className="h-4 w-4 mr-2" /> Publicar en ML</>}
              </Button>
            </div>
          )}
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
  /** Físico/DS filter: '__all__' | 'fisico' | 'ds' */
  const [filterDS,     setFilterDS    ] = useState<'__all__' | 'fisico' | 'ds'>('__all__')
  const [showFilters,  setShowFilters ] = useState(false)

  const [view,           setView          ] = useState<View>('grid')
  const [editTarget,     setEditTarget    ] = useState<Product | null>(null)
  const [dsEditTarget,   setDsEditTarget  ] = useState<Product | null>(null)
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
    if (filterDS     !== '__all__') qs.set('ds_filter',    filterDS)
    return qs.toString()
  }, [debouncedQ, sort, filterCat, filterAge, filterSeason, filterGender, filterExport, filterPhoto, filterDS])

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

  const handleDelete = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error al borrar')
      const data = await res.json() as { deleted: boolean; soft?: boolean; sales?: number }
      if (data.deleted) {
        setProducts(prev => prev.filter(p => p.id !== id))
        setEditTarget(null); setDsEditTarget(null)
        toast.success('Producto eliminado')
      } else {
        // Soft delete: actualizar en lista
        updateProduct(id, {
          exportable_web: false, exportable_whatsapp: false,
          exportable_instagram: false, exportable_facebook: false,
        })
        setEditTarget(null); setDsEditTarget(null)
        toast.success(`Producto ocultado de todos los canales (${data.sales} venta${data.sales !== 1 ? 's' : ''} registrada${data.sales !== 1 ? 's' : ''})`)
      }
    } catch (err) {
      toast.error(String(err))
    }
  }, [updateProduct])

  const activeFilterCount = [
    filterCat !== '__all__', filterAge !== '__all__', filterSeason !== '__all__',
    filterGender !== '__all__', filterExport !== '__all__', filterPhoto !== '__all__',
    filterDS !== '__all__',
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

            {/* Filtro DS / Físico */}
            <div className="flex rounded-md overflow-hidden border border-gray-200">
              {([
                ['__all__', 'Todos',   ''],
                ['fisico',  'Físico',  'hover:bg-gray-100'],
                ['ds',      'DS',      'hover:bg-sky-50'],
              ] as [typeof filterDS, string, string][]).map(([val, label, extra]) => (
                <button
                  key={val}
                  onClick={() => setFilterDS(val)}
                  className={`flex items-center gap-1 px-3 h-9 text-xs font-medium transition-colors border-r last:border-r-0
                    ${filterDS === val
                      ? val === 'ds'
                        ? 'bg-sky-600 text-white'
                        : val === 'fisico'
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-100 text-gray-700'
                      : `bg-white text-gray-500 ${extra}`
                    }`}
                >
                  {val === 'ds' && <Truck className="h-3 w-3" />}
                  {val === 'fisico' && <Package className="h-3 w-3" />}
                  {label}
                </button>
              ))}
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
                  <SelectItem value="ml">Mercado Libre</SelectItem>
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
                setFilterExport('__all__'); setFilterPhoto('__all__'); setFilterDS('__all__')
              }}>
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {products.map(p => (
              <ProductCard
                key={p.id} product={p}
                onUpdate={patch => updateProduct(p.id, patch)}
                onEdit={() => p.cj_pid ? setDsEditTarget(p) : setEditTarget(p)}
                onVariants={() => setVariantsTarget(p)}
                onHistory={() => setHistoryTarget(p)}
                onDelete={() => handleDelete(p.id)}
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
                  <th className="px-2 py-2.5 text-left">Tipo</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <ProductRow
                    key={p.id} product={p}
                    onUpdate={patch => updateProduct(p.id, patch)}
                    onEdit={() => p.cj_pid ? setDsEditTarget(p) : setEditTarget(p)}
                    onVariants={() => setVariantsTarget(p)}
                    onHistory={() => setHistoryTarget(p)}
                    onDelete={() => handleDelete(p.id)}
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

      {/* Diálogo de edición — producto físico */}
      {editTarget && (
        <EditProductDialog
          product={editTarget} categories={categories} ageGroups={ageGroups}
          seasons={seasons} genders={genders}
          onSaved={patch => { updateProduct(editTarget.id, patch); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Diálogo de edición — producto DS (Dropshipping CJ) */}
      {dsEditTarget && (
        <DSEditDialog
          product={dsEditTarget}
          onSaved={patch => { updateProduct(dsEditTarget.id, patch); setDsEditTarget(null) }}
          onClose={() => setDsEditTarget(null)}
          onDelete={() => handleDelete(dsEditTarget.id)}
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
