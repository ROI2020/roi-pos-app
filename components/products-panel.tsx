"use client"

import {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react"
import {
  LayoutGrid, List, Search, SlidersHorizontal, Pencil, Upload,
  ImageOff, Loader2, X, ChevronDown, Package, Plus,
} from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Badge }    from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// ── Types ──────────────────────────────────────────────────────────────────────
interface LookupItem  { id: number; name: string }

interface Product {
  id:           number
  name:         string
  description:  string | null
  base_price:   number
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

type View    = 'grid' | 'list'
type SortKey = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_desc'

// ── Canales de exportación ─────────────────────────────────────────────────────
const CHANNELS: {
  key: keyof Pick<Product,
    'exportable_whatsapp'|'exportable_instagram'|'exportable_facebook'|'exportable_web'>
  label: string
  on:  string
  off: string
}[] = [
  { key: 'exportable_whatsapp',  label: 'WA',  on: 'bg-green-100  text-green-700  border-green-300',  off: 'bg-gray-50 text-gray-300 border-gray-200' },
  { key: 'exportable_instagram', label: 'IG',  on: 'bg-pink-100   text-pink-700   border-pink-300',   off: 'bg-gray-50 text-gray-300 border-gray-200' },
  { key: 'exportable_facebook',  label: 'FB',  on: 'bg-emerald-100   text-emerald-700   border-emerald-300',   off: 'bg-gray-50 text-gray-300 border-gray-200' },
  { key: 'exportable_web',       label: 'Web', on: 'bg-indigo-100 text-indigo-700 border-indigo-300', off: 'bg-gray-50 text-gray-300 border-gray-200' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

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
    img.onerror = reject
    img.src = url
  })
}

// ── Toggles de exportación ─────────────────────────────────────────────────────
function ExportToggles({
  product,
  onToggle,
  compact = false,
}: {
  product:  Product
  onToggle: (key: string, value: boolean) => void
  compact?: boolean
}) {
  return (
    <div className={`flex ${compact ? 'gap-0.5' : 'gap-1'} flex-wrap`}>
      {CHANNELS.map(ch => {
        const active = product[ch.key]
        return (
          <button
            key={ch.key}
            title={`${active ? 'Quitar de' : 'Publicar en'} ${ch.label}`}
            onClick={e => { e.stopPropagation(); onToggle(ch.key, !active) }}
            className={`${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}
              font-semibold border rounded transition-all
              ${active ? ch.on : ch.off}
              hover:opacity-80 active:scale-95`}
          >
            {ch.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Miniatura de foto ──────────────────────────────────────────────────────────
function PhotoThumb({
  url, size = 48, className = '',
}: { url: string | null; size?: number; className?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
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
  product,
  onUploaded,
  size = 'sm',
}: {
  product:    Product
  onUploaded: (url: string) => void
  size?:      'sm' | 'lg'
}) {
  const ref      = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5_000_000) { toast.error('Foto máx. 5 MB'); return }
    setBusy(true)
    try {
      const dataUrl = await resizeImage(file, 900)
      const res = await fetch(`/api/products/${product.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ photo_url: dataUrl }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUploaded(dataUrl)
      toast.success('Foto actualizada')
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <>
      <button
        title="Subir foto"
        disabled={busy}
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
      <input
        ref={ref} type="file" accept="image/*"
        className="hidden" onChange={handleFile}
      />
    </>
  )
}

// ── Tarjeta de producto (vista cuadrícula) ─────────────────────────────────────
function ProductCard({
  product,
  onUpdate,
  onEdit,
}: {
  product:  Product
  onUpdate: (patch: Partial<Product>) => void
  onEdit:   () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handlePhotoClick = () => fileRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5_000_000) { toast.error('Foto máx. 5 MB'); return }
    setUploading(true)
    const prev = product.photo_url
    try {
      const dataUrl = await resizeImage(file, 900)
      onUpdate({ photo_url: dataUrl })                    // optimistic
      const res = await fetch(`/api/products/${product.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ photo_url: dataUrl }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Foto actualizada')
    } catch (err: unknown) {
      onUpdate({ photo_url: prev })
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleToggle = async (key: string, value: boolean) => {
    onUpdate({ [key]: value } as Partial<Product>)        // optimistic
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [key]: value }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    } catch (err: unknown) {
      onUpdate({ [key]: !value } as Partial<Product>)     // revert
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
      <div
        className="relative aspect-square bg-gray-50 cursor-pointer group"
        onClick={handlePhotoClick}
      >
        {product.photo_url
          ? <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
              <ImageOff className="h-8 w-8" />
              <span className="text-xs">Sin foto</span>
            </div>
          )
        }
        {/* Overlay al hover */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading
            ? <Loader2 className="h-8 w-8 text-white animate-spin" />
            : <Upload  className="h-8 w-8 text-white" />
          }
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">
            {product.name}
          </p>
          <p className="text-base font-bold text-violet-700 mt-0.5">{fmt(product.base_price)}</p>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map(b => (
              <span key={b} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                {b}
              </span>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          {product.variant_count} var · {product.stock_count} en stock
        </p>

        {/* Export toggles */}
        <ExportToggles product={product} onToggle={handleToggle} />

        {/* Editar */}
        <Button
          variant="ghost" size="sm"
          className="mt-auto gap-1.5 text-xs text-gray-500 hover:text-violet-700 h-7 justify-start px-1"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar producto
        </Button>
      </div>
    </div>
  )
}

// ── Fila de producto (vista lista) ────────────────────────────────────────────
function ProductRow({
  product,
  onUpdate,
  onEdit,
}: {
  product:  Product
  onUpdate: (patch: Partial<Product>) => void
  onEdit:   () => void
}) {
  const handleToggle = async (key: string, value: boolean) => {
    onUpdate({ [key]: value } as Partial<Product>)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [key]: value }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    } catch (err: unknown) {
      onUpdate({ [key]: !value } as Partial<Product>)
      toast.error((err as Error).message)
    }
  }

  const badges = [
    product.category_name,  product.age_group_name,
    product.season_name,    product.gender_name,
  ].filter(Boolean)

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      {/* Foto */}
      <td className="pl-4 pr-2 py-2.5">
        <PhotoThumb url={product.photo_url} size={44} />
      </td>

      {/* Nombre */}
      <td className="px-2 py-2.5">
        <p className="font-medium text-sm text-gray-900">{product.name}</p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {badges.map(b => (
              <span key={b} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                {b}
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Precio */}
      <td className="px-2 py-2.5 text-sm font-semibold text-violet-700 whitespace-nowrap">
        {fmt(product.base_price)}
      </td>

      {/* Stock */}
      <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap hidden sm:table-cell">
        {product.stock_count} / {product.variant_count}
      </td>

      {/* Export toggles */}
      <td className="px-2 py-2.5">
        <ExportToggles product={product} onToggle={handleToggle} compact />
      </td>

      {/* Acciones */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          <PhotoUploadButton
            product={product}
            onUploaded={url => onUpdate({ photo_url: url })}
          />
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-gray-400 hover:text-violet-700"
            title="Editar"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ── Diálogo de edición de producto ────────────────────────────────────────────
function EditProductDialog({
  product,
  categories,
  ageGroups,
  seasons,
  genders,
  onSaved,
  onClose,
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
  const [categoryId,  setCategoryId ] = useState(product.category_id  ? String(product.category_id)  : '__none__')
  const [ageGroupId,  setAgeGroupId ] = useState(product.age_group_id ? String(product.age_group_id) : '__none__')
  const [seasonId,    setSeasonId   ] = useState(product.season_id    ? String(product.season_id)    : '__none__')
  const [genderId,    setGenderId   ] = useState(product.gender_id    ? String(product.gender_id)    : '__none__')
  const [photoUrl,    setPhotoUrl   ] = useState(product.photo_url)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [saving,      setSaving     ] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5_000_000) { toast.error('Foto máx. 5 MB'); return }
    setPhotoUploading(true)
    try {
      setPhotoUrl(await resizeImage(file, 900))
    } catch { toast.error('Error al procesar la imagen') }
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
        category_id:  categoryId  !== '__none__' ? parseInt(categoryId)  : null,
        age_group_id: ageGroupId  !== '__none__' ? parseInt(ageGroupId)  : null,
        season_id:    seasonId    !== '__none__' ? parseInt(seasonId)    : null,
        gender_id:    genderId    !== '__none__' ? parseInt(genderId)    : null,
        photo_url: photoUrl,
      }
      const res = await fetch(`/api/products/${product.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Producto actualizado')
      onSaved(body)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

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
                <Button
                  variant="outline" size="sm" className="gap-1.5 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Subir imagen
                </Button>
                {photoUrl && (
                  <Button
                    variant="ghost" size="sm"
                    className="text-xs text-red-400 hover:text-red-600"
                    onClick={() => setPhotoUrl(null)}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Quitar
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-gray-400">JPG/PNG · max 5 MB · se redimensiona a 900×900</p>
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
            <Label>Descripción</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {/* Precio */}
          <div className="space-y-1.5">
            <Label>Precio de lista ($)</Label>
            <Input
              type="number" min={0} step="0.01"
              value={price} onChange={e => setPrice(e.target.value)}
            />
          </div>

          {/* Clasificación – 2 col grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Categoría',    value: categoryId, setter: setCategoryId, items: categories },
              { label: 'Edad',         value: ageGroupId, setter: setAgeGroupId, items: ageGroups  },
              { label: 'Temporada',    value: seasonId,   setter: setSeasonId,   items: seasons    },
              { label: 'Género',       value: genderId,   setter: setGenderId,   items: genders    },
            ].map(({ label, value, setter, items }) => (
              <div key={label} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Select value={value} onValueChange={setter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="italic text-gray-400">Sin asignar</span>
                    </SelectItem>
                    {items.map(i => (
                      <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Exportación */}
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Exportar a catálogos</Label>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(ch => {
                const active = product[ch.key]
                return (
                  <span
                    key={ch.key}
                    className={`text-xs px-3 py-1 rounded-full border font-medium cursor-default
                      ${active ? ch.on : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                  >
                    {ch.label} {active ? '✓' : '—'}
                  </span>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-400">
              Usá los toggles en la tarjeta/lista para activar cada canal.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════
export default function ProductsPanel() {
  // ── Lookups ──────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<LookupItem[]>([])
  const [ageGroups,  setAgeGroups ] = useState<LookupItem[]>([])
  const [seasons,    setSeasons   ] = useState<LookupItem[]>([])
  const [genders,    setGenders   ] = useState<LookupItem[]>([])

  // ── Productos ────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading ] = useState(true)
  const [hasMore,  setHasMore ] = useState(false)
  const [offset,   setOffset  ] = useState(0)

  // ── Filtros / búsqueda / orden ────────────────────────────────────────────
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

  // ── UI ────────────────────────────────────────────────────────────────────
  const [view,       setView      ] = useState<View>('grid')
  const [editTarget, setEditTarget] = useState<Product | null>(null)

  // ── Carga de lookups ──────────────────────────────────────────────────────
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

  // ── Debounce de búsqueda ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  // ── Build query string ────────────────────────────────────────────────────
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

  // ── Carga inicial / al cambiar filtros ────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setOffset(0)
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

  // ── Actualizar producto en la lista local ─────────────────────────────────
  const updateProduct = useCallback((id: number, patch: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    if (editTarget?.id === id) setEditTarget(prev => prev ? { ...prev, ...patch } : prev)
  }, [editTarget])

  const activeFilterCount = [
    filterCat !== '__all__', filterAge !== '__all__', filterSeason !== '__all__',
    filterGender !== '__all__', filterExport !== '__all__', filterPhoto !== '__all__',
  ].filter(Boolean).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Cabecera ── */}
      <div className="bg-white border-b shadow-sm sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          {/* Título + controles de vista */}
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
            <div className="flex items-center gap-2">
              {/* Vista */}
              <div className="flex border rounded-lg overflow-hidden">
                {([['grid', LayoutGrid], ['list', List]] as [View, React.ElementType][]).map(([v, Icon]) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`p-2 transition-colors ${view === v
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Barra de búsqueda + sort + filtros */}
          <div className="flex gap-2 flex-wrap">
            {/* Búsqueda */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                className="pl-9 h-9 text-sm"
                placeholder="Buscar por nombre…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              {q && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setQ('')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Orden */}
            <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 text-sm w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Nombre A→Z</SelectItem>
                <SelectItem value="name_desc">Nombre Z→A</SelectItem>
                <SelectItem value="price_asc">Precio ↑</SelectItem>
                <SelectItem value="price_desc">Precio ↓</SelectItem>
                <SelectItem value="stock_desc">Más stock</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtros toggle */}
            <Button
              variant="outline" size="sm"
              className={`gap-1.5 h-9 ${activeFilterCount > 0 ? 'border-violet-400 text-violet-700 bg-violet-50' : ''}`}
              onClick={() => setShowFilters(v => !v)}
            >
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

          {/* Panel de filtros desplegable */}
          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pb-1">
              {[
                { label: 'Categoría',  value: filterCat,    setter: setFilterCat,    items: categories },
                { label: 'Edad',       value: filterAge,    setter: setFilterAge,    items: ageGroups  },
                { label: 'Temporada',  value: filterSeason, setter: setFilterSeason, items: seasons    },
                { label: 'Género',     value: filterGender, setter: setFilterGender, items: genders    },
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
              {/* Exportable */}
              <Select value={filterExport} onValueChange={setFilterExport}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__"><span className="italic text-gray-400">Canal (todos)</span></SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                </SelectContent>
              </Select>
              {/* Foto */}
              <Select value={filterPhoto} onValueChange={setFilterPhoto}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Foto" />
                </SelectTrigger>
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
            <Loader2 className="h-6 w-6 animate-spin" />
            Cargando productos…
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <Package className="h-12 w-12 text-gray-300" />
            <p className="font-medium text-gray-500">No hay productos con esos filtros</p>
            {(q || activeFilterCount > 0) && (
              <Button variant="outline" size="sm" onClick={() => { setQ(''); setFilterCat('__all__'); setFilterAge('__all__'); setFilterSeason('__all__'); setFilterGender('__all__'); setFilterExport('__all__'); setFilterPhoto('__all__') }}>
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : view === 'grid' ? (
          /* ── Vista cuadrícula ── */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {products.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                onUpdate={patch => updateProduct(p.id, patch)}
                onEdit={() => setEditTarget(p)}
              />
            ))}
          </div>
        ) : (
          /* ── Vista lista ── */
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="pl-4 pr-2 py-2.5 text-left w-12" />
                  <th className="px-2 py-2.5 text-left">Producto</th>
                  <th className="px-2 py-2.5 text-left">Precio</th>
                  <th className="px-2 py-2.5 text-left hidden sm:table-cell">Stock</th>
                  <th className="px-2 py-2.5 text-left">Exportar</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    onUpdate={patch => updateProduct(p.id, patch)}
                    onEdit={() => setEditTarget(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" onClick={loadMore} disabled={loading} className="gap-2">
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Plus className="h-4 w-4" />
              }
              Cargar más
            </Button>
          </div>
        )}
      </div>

      {/* ── Diálogo de edición ── */}
      {editTarget && (
        <EditProductDialog
          product={editTarget}
          categories={categories}
          ageGroups={ageGroups}
          seasons={seasons}
          genders={genders}
          onSaved={patch => {
            updateProduct(editTarget.id, patch)
            setEditTarget(null)
          }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
