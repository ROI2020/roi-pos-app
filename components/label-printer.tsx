"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  Printer, Search, ArrowLeft, Plus, Loader2, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Tag, RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Badge }    from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ── Types ──────────────────────────────────────────────────────────────────────
interface LookupItem { id: number; name: string }
interface Branch    { id: number; name: string }
interface LabelSettings { businessName: string | null; businessLogo: string | null }

interface LabelVariant {
  id: number
  sku: string
  barcode: string
  color: string
  size: string
  label_printed_at: string | null
  product_id: number
  product_name: string
  base_price: number
  category_name:  string | null
  age_group_name: string | null
  season_name:    string | null
  gender_name:    string | null
  branch_id:   number | null
  branch_name: string | null
}

interface Group {
  key: string
  product_id: number; product_name: string
  color: string
  items: LabelVariant[]
}

type Step = 'select' | 'preview'

// ── Formatos ───────────────────────────────────────────────────────────────────
const fmtPrice = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

// ── Componente barcode (jsbarcode via useEffect, solo client) ─────────────────
function BarcodeImg({ value, height = 40 }: { value: string; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!value || !svgRef.current) return
    import('jsbarcode').then(mod => {
      const JsBarcode = mod.default
      try {
        JsBarcode(svgRef.current, value, {
          format:       'CODE128',
          width:        1.4,
          height,
          displayValue: true,
          fontSize:     9,
          margin:       2,
          textMargin:   1,
          background:   'transparent',
          lineColor:    '#000',
        })
      } catch {
        // valor inválido para barcode, ignorar
      }
    })
  }, [value, height])

  return <svg ref={svgRef} className="max-w-full" />
}

// ── Etiqueta individual ────────────────────────────────────────────────────────
// Dimensiones de impresión: 60mm × 30mm  (rollo continuo)
function LabelCard({ variant, settings }: { variant: LabelVariant; settings: LabelSettings }) {
  const printed  = !!variant.label_printed_at
  const bizName  = settings.businessName ?? 'ROI POS'

  return (
    <div className="label-card">
      {/* Header: logo izquierda | nombre centrado | by ROIPOS derecha */}
      <div className="label-header">
        {settings.businessLogo && (
          <img
            src={settings.businessLogo}
            alt=""
            className="label-logo"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <span className="label-brand">{bizName}</span>
        <span className="label-by">by ROIPOS</span>
      </div>

      {/* Nombre del producto (izq) + Precio (der) */}
      <div className="label-product-row">
        <p className="label-product">{variant.product_name}</p>
        <p className="label-price">{fmtPrice(variant.base_price)}</p>
      </div>

      {/* Color + Talle */}
      <div className="label-attrs">
        <span>{variant.color}</span>
        <span className="label-sep">·</span>
        <span className="label-size">T.{variant.size}</span>
      </div>

      {/* Código de barras */}
      <div className="label-barcode">
        <BarcodeImg value={variant.barcode} height={22} />
      </div>

      {/* Marca de ya impresa (solo visible en pantalla) */}
      {printed && (
        <div className="label-printed-badge">✓ impresa</div>
      )}
    </div>
  )
}

// ── Panel de selección (step = 'select') ──────────────────────────────────────
function SelectionPanel({
  onPreview,
}: {
  onPreview: (variants: LabelVariant[]) => void
}) {
  const [branches,   setBranches  ] = useState<Branch[]>([])
  const [categories, setCategories] = useState<LookupItem[]>([])
  const [ageGroups,  setAgeGroups ] = useState<LookupItem[]>([])
  const [seasons,    setSeasons   ] = useState<LookupItem[]>([])
  const [genders,    setGenders   ] = useState<LookupItem[]>([])

  const [unprinted,   setUnprinted  ] = useState(true)
  const [textQuery,   setTextQuery  ] = useState('')
  const [branchId,    setBranchId   ] = useState('__all__')
  const [categoryId,  setCategoryId ] = useState('__all__')
  const [ageGroupId,  setAgeGroupId ] = useState('__all__')
  const [seasonId,    setSeasonId   ] = useState('__all__')
  const [genderId,    setGenderId   ] = useState('__all__')
  const [colorFilter, setColorFilter] = useState('')

  const [variants,  setVariants ] = useState<LabelVariant[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected,       setSelected      ] = useState<Set<number>>(new Set())
  const [collapsedGroups,setCollapsedGroups] = useState<Set<string>>(new Set())

  const loadLookups = useCallback(async () => {
    try {
      const [bs, cats, ages, seas, gens] = await Promise.all([
        fetch('/api/branches').then(r   => r.json()),
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/age-groups').then(r => r.json()),
        fetch('/api/seasons').then(r    => r.json()),
        fetch('/api/genders').then(r    => r.json()),
      ])
      setBranches(bs)
      setCategories(cats)
      setAgeGroups(ages)
      setSeasons(seas)
      setGenders(gens)
    } catch { toast.error('Error al cargar listas') }
  }, [])

  useEffect(() => { loadLookups() }, [loadLookups])

  const groups = useMemo((): Group[] => {
    if (!variants) return []
    const map = new Map<string, Group>()
    for (const v of variants) {
      const key = `${v.product_id}|${v.color}`
      if (!map.has(key)) map.set(key, { key, product_id: v.product_id, product_name: v.product_name, color: v.color, items: [] })
      map.get(key)!.items.push(v)
    }
    return [...map.values()]
  }, [variants])

  const tooMany = variants !== null && variants.length > 200

  const handleSearch = async () => {
    setSearching(true)
    setVariants(null)
    setSelected(new Set())
    setCollapsedGroups(new Set())
    try {
      const qs = new URLSearchParams()
      if (unprinted)               qs.set('unprinted',   'true')
      if (textQuery.trim())        qs.set('q',           textQuery.trim())
      if (branchId   !== '__all__') qs.set('branch_id',   branchId)
      if (categoryId !== '__all__') qs.set('category_id', categoryId)
      if (ageGroupId !== '__all__') qs.set('age_group_id',ageGroupId)
      if (seasonId   !== '__all__') qs.set('season_id',   seasonId)
      if (genderId   !== '__all__') qs.set('gender_id',   genderId)
      if (colorFilter.trim())       qs.set('color',       colorFilter.trim())

      const data: LabelVariant[] = await fetch(`/api/labels/variants?${qs}`).then(r => r.json())
      setVariants(data)
      if (data.length <= 200) setSelected(new Set(data.map(v => v.id)))
    } catch { toast.error('Error al buscar prendas') }
    finally  { setSearching(false) }
  }

  const toggleVariant = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleGroup = (group: Group) => {
    const ids   = group.items.map(i => i.id)
    const allOn = ids.every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      allOn ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id))
      return n
    })
  }

  const toggleCollapse = (key: string) =>
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const handlePreviewClick = () => {
    if (selected.size === 0) { toast.error('Seleccioná al menos una prenda'); return }
    const selVariants = variants!.filter(v => selected.has(v.id))
    onPreview(selVariants)
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filtros</p>

        {/* Toggle sin imprimir / todas */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-1 py-1 w-fit">
          {[true, false].map(val => (
            <button
              key={String(val)}
              className={`text-sm px-3 py-1 rounded-md transition-colors ${
                unprinted === val
                  ? 'bg-white text-gray-800 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setUnprinted(val)}
            >
              {val ? 'Sin imprimir' : 'Todas'}
            </button>
          ))}
        </div>

        {/* Búsqueda libre */}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Búsqueda libre</Label>
          <Input
            className="h-9 text-sm"
            placeholder="Ej: jean gris T14, zapatilla blanca 38…"
            value={textQuery}
            onChange={e => setTextQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <p className="text-[11px] text-gray-400">
            Ingresá palabras separadas por espacios — se busca en nombre, color, talle, SKU, barcode, categoría, temporada…
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Sucursal */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Sucursal</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__"><span className="italic text-gray-400">Todas</span></SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__"><span className="italic text-gray-400">Todas</span></SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Edad */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Edad</Label>
            <Select value={ageGroupId} onValueChange={setAgeGroupId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__"><span className="italic text-gray-400">Todos</span></SelectItem>
                {ageGroups.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Temporada */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Temporada</Label>
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__"><span className="italic text-gray-400">Todas</span></SelectItem>
                {seasons.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Género */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Género</Label>
            <Select value={genderId} onValueChange={setGenderId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__"><span className="italic text-gray-400">Todos</span></SelectItem>
                {genders.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Color</Label>
            <Input
              className="h-9 text-sm" placeholder="Ej: negro, rojo…"
              value={colorFilter} onChange={e => setColorFilter(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={handleSearch} disabled={searching} className="gap-2">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar prendas
          </Button>
        </div>
      </div>

      {/* Resultados */}
      {variants !== null && (
        <div className="space-y-3">
          {tooMany ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800">Demasiados resultados</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Hay más de 200 prendas. Ajustá los filtros para acotar la búsqueda.
                </p>
              </div>
            </div>
          ) : variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
              <p className="font-medium text-gray-600">No hay prendas con esos filtros.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                  {variants.length} prenda{variants.length !== 1 ? 's' : ''}
                  {' · '}
                  <span className="font-medium text-gray-700">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected(new Set(variants.map(v => v.id)))}>
                    Todas
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                    Ninguna
                  </Button>
                </div>
              </div>

              {/* Grupos */}
              <div className="space-y-2">
                {groups.map(group => {
                  const collapsed    = collapsedGroups.has(group.key)
                  const ids          = group.items.map(i => i.id)
                  const allSelected  = ids.every(id => selected.has(id))
                  const someSelected = ids.some(id => selected.has(id))
                  const printedCount = group.items.filter(i => i.label_printed_at).length

                  return (
                    <div key={group.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
                        onClick={() => toggleCollapse(group.key)}
                      >
                        <div onClick={e => { e.stopPropagation(); toggleGroup(group) }} className="shrink-0">
                          <Checkbox
                            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{group.product_name}</p>
                          <p className="text-xs text-gray-500">{group.color}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {group.items.length} prenda{group.items.length !== 1 ? 's' : ''}
                          </Badge>
                          {printedCount > 0 && (
                            <Badge variant="outline" className="text-xs border-green-300 text-green-600">
                              {printedCount} impresa{printedCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        {collapsed
                          ? <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                          : <ChevronDown  className="h-4 w-4 text-gray-400 shrink-0" />
                        }
                      </div>

                      {!collapsed && (
                        <div className="border-t border-gray-100 divide-y divide-gray-50">
                          {group.items.map(v => (
                            <label
                              key={v.id}
                              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                            >
                              <Checkbox
                                checked={selected.has(v.id)}
                                onCheckedChange={() => toggleVariant(v.id)}
                              />
                              <span className="text-sm text-gray-700 font-medium w-12 shrink-0">
                                T.{v.size}
                              </span>
                              <span className="text-xs text-gray-400 font-mono truncate flex-1">
                                {v.barcode}
                              </span>
                              {v.label_printed_at && (
                                <Badge variant="outline" className="text-[10px] shrink-0 border-green-300 text-green-600 px-1.5 py-0">
                                  ✓ impresa
                                </Badge>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Barra de acción */}
              <div className="sticky bottom-4 bg-white border border-gray-200 rounded-xl shadow-lg px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold text-violet-700">{selected.size}</span>
                  {' '}etiqueta{selected.size !== 1 ? 's' : ''} para generar
                </p>
                <Button
                  onClick={handlePreviewClick}
                  disabled={selected.size === 0}
                  className="gap-2"
                >
                  <Tag className="h-4 w-4" />
                  Previsualizar etiquetas
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Panel de previsualización (step = 'preview') ──────────────────────────────
function PreviewPanel({
  variants,
  onBack,
  settings,
}: {
  variants:  LabelVariant[]
  onBack:    () => void
  settings:  LabelSettings
}) {
  const [marking,  setMarking ] = useState(false)
  const [marked,   setMarked  ] = useState(false)

  const handlePrint = async () => {
    // 1. Marcar como impresas
    setMarking(true)
    try {
      const res  = await fetch('/api/labels/mark-printed', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ variant_ids: variants.map(v => v.id) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMarked(true)
      toast.success(`${data.marked} etiqueta${data.marked !== 1 ? 's' : ''} marcada${data.marked !== 1 ? 's' : ''} como impresas`)
    } catch (err: unknown) {
      toast.error((err as Error).message)
      setMarking(false)
      return
    }
    setMarking(false)

    // 2. Abrir diálogo de impresión
    setTimeout(() => window.print(), 100)
  }

  const handleUnmark = async () => {
    if (!marked) return
    try {
      await fetch('/api/labels/mark-printed', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ variant_ids: variants.map(v => v.id) }),
      })
      setMarked(false)
      toast.success('Marca de impresión removida')
    } catch { toast.error('Error al desmarcar') }
  }

  return (
    <div className="space-y-4">
      {/* Barra de acciones (oculta al imprimir) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border rounded-xl shadow-sm px-5 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <span className="text-sm text-gray-500">
            {variants.length} etiqueta{variants.length !== 1 ? 's' : ''} listas para imprimir
          </span>
        </div>

        <div className="flex items-center gap-2">
          {marked && (
            <Button variant="outline" size="sm" onClick={handleUnmark} className="gap-2 text-gray-500">
              <RotateCcw className="h-3.5 w-3.5" />
              Desmarcar
            </Button>
          )}
          <Button
            onClick={handlePrint}
            disabled={marking}
            className="gap-2"
          >
            {marking
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Printer   className="h-4 w-4" />
            }
            {marked ? 'Imprimir de nuevo' : 'Imprimir y marcar'}
          </Button>
        </div>
      </div>

      {/* Nota de instrucciones */}
      <div className="no-print bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">
        <strong>Consejo:</strong> en el diálogo de impresión, desactivá los encabezados/pies de página
        y ajustá el margen a 5mm para que las etiquetas queden bien alineadas.
        Tamaño de etiqueta: <strong>60mm × 30mm</strong> · rollo continuo.
      </div>

      {/* Grilla de etiquetas */}
      <div className="label-print-area">
        {variants.map(v => <LabelCard key={v.id} variant={v} settings={settings} />)}
      </div>

      {/* Estilos de impresión inyectados inline */}
      <style>{`

        /* ════════════════════════════════════════
           PANTALLA: preview compacto ~240 x 115px
        ════════════════════════════════════════ */
        .label-print-area {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 8px 0;
        }

        .label-card {
          position: relative;
          width: 240px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 6px 10px 4px;
          background: #fff;
          display: flex;
          flex-direction: column;
          gap: 1px;
          box-shadow: 0 1px 3px rgba(0,0,0,.08);
          overflow: hidden;
        }

        /* Header: logo izq | nombre centrado | by ROIPOS der */
        .label-header {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 20px;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 3px;
          margin-bottom: 2px;
        }
        .label-logo {
          height: 18px; width: auto; max-width: 38px;
          object-fit: contain; flex-shrink: 0; z-index: 1;
        }
        .label-brand {
          position: absolute; left: 0; right: 0;
          text-align: center; pointer-events: none;
          font-size: 8px; font-weight: 700; color: #4c1d95;
          letter-spacing: .05em; text-transform: uppercase;
        }
        .label-by { font-size: 6px; color: #999; z-index: 1; flex-shrink: 0; }

        /* Nombre + precio en la misma fila */
        .label-product-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 4px;
        }
        .label-product { font-size: 10px; font-weight: 600; color: #111; line-height: 1.2; }
        .label-price   { font-size: 12px; font-weight: 700; color: #111; white-space: nowrap; flex-shrink: 0; }
        .label-attrs   { font-size: 9px; color: #333; display: flex; align-items: center; gap: 3px; }
        .label-sep     { color: #999; }
        .label-size    { font-weight: 600; }
        .label-barcode { margin-top: 2px; }
        .label-barcode svg { width: 100%; height: auto; }

        .label-printed-badge {
          position: absolute; top: 3px; right: 3px;
          font-size: 7px; color: #16a34a;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 3px; padding: 1px 4px;
        }


        /* ════════════════════════════════════════
           IMPRESIÓN: rollo 60 mm × 30 mm
           Negro puro — sin grises ni colores
        ════════════════════════════════════════ */
        @media print {

          /* 1. Ocultar toda la UI */
          nav, header, .no-print, [data-sonner-toaster] {
            display: none !important;
          }

          /* 2. Reset nuclear: eliminar CUALQUIER margen/padding que desplace las etiquetas */
          * {
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
          }

          body { background: white !important; }

          /* 3. Una etiqueta = una página del rollo (60 × 30 mm) */
          @page { size: 60mm 30mm; margin: 0; }

          /* 4. Contenedor: bloque sin espacio */
          .label-print-area {
            display: block !important;
            width: 60mm !important;
          }

          /* 5. Cada etiqueta ocupa exactamente 1 página.
                page-break-BEFORE en todas excepto la primera →
                sin página en blanco al final */
          .label-card {
            display: flex !important;
            flex-direction: column !important;
            width: 60mm !important;
            height: 30mm !important;
            padding: 1.5mm 2.5mm 1mm !important;
            overflow: hidden !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: white !important;
            page-break-before: always !important;
            break-before: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Primera etiqueta: empieza sin salto previo */
          .label-card:first-child {
            page-break-before: auto !important;
            break-before: auto !important;
          }

          /* Negro puro en todo */
          .label-card, .label-card * { color: #000 !important; }

          /* Header: logo izq | nombre centrado | by ROIPOS der */
          .label-header {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            min-height: 5.5mm !important;
            border-bottom: 0.3mm solid #000 !important;
            padding-bottom: 0.7mm !important;
            margin-bottom: 0.7mm !important;
            padding-top: 0 !important;
          }
          .label-logo  { max-height: 5mm !important; width: auto !important; max-width: 14mm !important; }
          .label-brand { font-size: 6.5pt !important; font-weight: 700 !important; text-transform: uppercase !important; }
          .label-by    { font-size: 4pt !important; }

          /* Nombre + precio en la misma fila */
          .label-product-row {
            display: flex !important;
            align-items: baseline !important;
            justify-content: space-between !important;
            gap: 1mm !important;
          }
          .label-product { font-size: 7pt !important;   font-weight: 600 !important; line-height: 1.25 !important; }
          .label-price   { font-size: 8.5pt !important; font-weight: 700 !important; white-space: nowrap !important; flex-shrink: 0 !important; }

          /* Color · Talle */
          .label-attrs   { font-size: 6.5pt !important; display: flex !important; align-items: center !important; }

          /* Barcode */
          .label-barcode { margin-top: 0.5mm !important; }
          .label-barcode svg { width: 100% !important; height: 7.5mm !important; }

          /* Ocultar badge */
          .label-printed-badge { display: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function LabelPrinter() {
  const [step,            setStep           ] = useState<Step>('select')
  const [previewVariants, setPreviewVariants] = useState<LabelVariant[]>([])
  const [labelSettings,   setLabelSettings  ] = useState<LabelSettings>({
    businessName: null, businessLogo: null,
  })

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((s: Record<string, string | null>) => {
        setLabelSettings({
          businessName: s.business_name ?? null,
          businessLogo: s.business_logo ?? null,
        })
      })
      .catch(() => {})
  }, [])

  const handlePreview = (variants: LabelVariant[]) => {
    setPreviewVariants(variants)
    setStep('preview')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 print-reset">
      <div className="max-w-5xl mx-auto space-y-6 print-reset">

        {/* Título */}
        {step === 'select' && (
          <div className="flex items-center gap-3 no-print">
            <Tag className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Impresión de Etiquetas</h1>
              <p className="text-sm text-gray-500">
                Seleccioná las prendas, previsulizá e imprimí las etiquetas con código de barras
              </p>
            </div>
          </div>
        )}

        {step === 'select'
          ? <SelectionPanel onPreview={handlePreview} />
          : <PreviewPanel
              variants={previewVariants}
              onBack={() => setStep('select')}
              settings={labelSettings}
            />
        }
      </div>
    </div>
  )
}
