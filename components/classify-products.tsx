"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, CheckCircle2, Loader2, Tags, Save, Search, X } from "lucide-react"
import { toast } from "sonner"
import { Button }  from "@/components/ui/button"
import { Input }   from "@/components/ui/input"
import { Label }   from "@/components/ui/label"
import { Badge }   from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// ── Types ──────────────────────────────────────────────────────────────────────
interface LookupItem { id: number; name: string }

interface Product {
  id: number; name: string; description: string | null
  category_id:  number | null; category_name:  string | null
  age_group_id: number | null; age_group_name: string | null
  season_id:    number | null; season_name:    string | null
  gender_id:    number | null; gender_name:    string | null
}

type LookupType = 'category' | 'age_group' | 'season' | 'gender'

const COLS: { type: LookupType; label: string; apiPath: string; fieldId: string; nameField: string }[] = [
  { type: 'category',  label: 'Categoría', apiPath: '/api/categories', fieldId: 'category_id',  nameField: 'category_name'  },
  { type: 'age_group', label: 'Edad',      apiPath: '/api/age-groups', fieldId: 'age_group_id', nameField: 'age_group_name' },
  { type: 'season',    label: 'Temporada', apiPath: '/api/seasons',    fieldId: 'season_id',    nameField: 'season_name'    },
  { type: 'gender',    label: 'Género',    apiPath: '/api/genders',    fieldId: 'gender_id',    nameField: 'gender_name'    },
]

const NONE = '__null__'

// ── Componente ─────────────────────────────────────────────────────────────────
export default function ClassifyProducts() {
  // ── Datos ──────────────────────────────────────────────────────────────────
  const [products,    setProducts   ] = useState<Product[]>([])
  const [lookups,     setLookups    ] = useState<Record<LookupType, LookupItem[]>>({
    category: [], age_group: [], season: [], gender: [],
  })
  const [loading,     setLoading    ] = useState(true)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [search,      setSearch     ] = useState('')

  // ── Selección ──────────────────────────────────────────────────────────────
  const [selected,    setSelected   ] = useState<Set<number>>(new Set())

  // ── Combos del header + guardado bulk ─────────────────────────────────────
  const [bulkVal,     setBulkVal    ] = useState<Record<LookupType, string>>({
    category: NONE, age_group: NONE, season: NONE, gender: NONE,
  })
  const [bulkSaving,  setBulkSaving ] = useState<Record<LookupType, boolean>>({
    category: false, age_group: false, season: false, gender: false,
  })

  // ── Diálogo alta rápida ────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<{
    type: LookupType; newName: string; saving: boolean
  } | null>(null)

  // ── Carga ─────────────────────────────────────────────────────────────────
  const loadLookups = useCallback(async () => {
    const [cats, ages, seas, gens] = await Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/age-groups').then(r => r.json()),
      fetch('/api/seasons').then(r => r.json()),
      fetch('/api/genders').then(r => r.json()),
    ])
    setLookups({ category: cats, age_group: ages, season: seas, gender: gens })
  }, [])

  const loadProducts = useCallback(async (unclassified: boolean) => {
    setLoading(true)
    try {
      const data = await fetch(`/api/products${unclassified ? '?unclassified=true' : ''}`).then(r => r.json())
      setProducts(data)
      setSelected(new Set())
    } catch { toast.error('Error al cargar productos') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { loadLookups() }, [loadLookups])
  useEffect(() => { loadProducts(onlyMissing) }, [onlyMissing, loadProducts])

  // ── Productos filtrados por búsqueda ───────────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false)
    )
  }, [products, search])

  // ── Selección ──────────────────────────────────────────────────────────────
  const allVisibleSelected = visible.length > 0 && visible.every(p => selected.has(p.id))
  const someSelected       = selected.size > 0

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => {
        const s = new Set(prev)
        visible.forEach(p => s.delete(p.id))
        return s
      })
    } else {
      setSelected(prev => {
        const s = new Set(prev)
        visible.forEach(p => s.add(p.id))
        return s
      })
    }
  }

  const toggleOne = (id: number) =>
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })

  // ── Aplicar clasificación masiva ───────────────────────────────────────────
  const handleBulkApply = async (col: typeof COLS[number]) => {
    if (selected.size === 0) { toast.error('Seleccioná al menos un producto'); return }

    const rawVal  = bulkVal[col.type]
    const numVal  = rawVal === NONE ? null : parseInt(rawVal)
    const found   = lookups[col.type].find(i => i.id === numVal)

    setBulkSaving(s => ({ ...s, [col.type]: true }))
    try {
      const res = await fetch('/api/products/bulk-classify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: [...selected], field: col.fieldId, value: numVal }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      // Actualizar estado local
      setProducts(prev => prev.map(p =>
        selected.has(p.id)
          ? { ...p, [col.fieldId]: numVal, [col.nameField]: found?.name ?? null }
          : p
      ))
      toast.success(
        `${col.label} → "${found?.name ?? 'Sin asignar'}" aplicada a ${selected.size} producto${selected.size !== 1 ? 's' : ''}`
      )
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setBulkSaving(s => ({ ...s, [col.type]: false }))
    }
  }

  // ── Alta rápida de lookup ──────────────────────────────────────────────────
  const saveNewLookup = async () => {
    if (!dialog?.newName.trim()) return
    setDialog(d => d ? { ...d, saving: true } : null)
    const col = COLS.find(c => c.type === dialog!.type)!
    try {
      const res  = await fetch(col.apiPath, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ name: dialog!.newName.trim() }),
      })
      const item = await res.json()
      if (!res.ok) throw new Error(item.error)
      setLookups(prev => ({ ...prev, [col.type]: [...prev[col.type], item] }))
      // Pre-seleccionar el nuevo valor en el combo del header
      setBulkVal(v => ({ ...v, [col.type]: String(item.id) }))
      toast.success(`"${item.name}" creado — ahora podés aplicarlo`)
      setDialog(null)
    } catch (err: unknown) {
      toast.error((err as Error).message)
      setDialog(d => d ? { ...d, saving: false } : null)
    }
  }

  // ── Completitud ────────────────────────────────────────────────────────────
  const completeness = (p: Product) => {
    const filled = [p.category_id, p.age_group_id, p.season_id, p.gender_id].filter(v => v !== null).length
    return { filled, complete: filled === 4 }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Título + controles */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Tags className="h-6 w-6 text-violet-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Clasificación de Productos</h1>
              <p className="text-xs text-gray-500">Seleccioná productos → elegí valor en la columna → Guardar</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Buscador */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Buscar producto…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 w-48"
              />
              {search && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearch('')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Toggle filtro */}
            <div className="flex items-center bg-white rounded-lg border px-1 py-1 gap-0.5">
              {[{ val: true, label: 'Sin clasificar' }, { val: false, label: 'Todos' }].map(opt => (
                <button
                  key={String(opt.val)}
                  className={`text-xs px-3 py-1 rounded-md transition-colors
                    ${onlyMissing === opt.val ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setOnlyMissing(opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Barra de selección activa */}
        {someSelected && (
          <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2 text-sm">
            <span className="font-semibold text-violet-700">
              {selected.size} producto{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}
            </span>
            <span className="text-violet-400">·</span>
            <span className="text-violet-600 text-xs">Usá los controles del encabezado de cada columna para aplicar la clasificación</span>
            <button
              className="ml-auto text-xs text-violet-500 hover:text-violet-700 underline"
              onClick={() => setSelected(new Set())}
            >
              Deseleccionar todo
            </button>
          </div>
        )}

        {/* ── Tabla ──────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />Cargando…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
            <p className="font-medium text-gray-600">
              {products.length === 0
                ? (onlyMissing ? '¡Todos los productos están clasificados!' : 'No hay productos.')
                : 'No hay resultados para esa búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">

              {/* Encabezados con controles bulk */}
              <thead>
                <tr className="border-b bg-gray-50">

                  {/* Checkbox "todos" */}
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                      checked={allVisibleSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allVisibleSelected }}
                      onChange={toggleAll}
                    />
                  </th>

                  {/* Producto */}
                  <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">
                    <div className="flex items-center gap-2">
                      <span>Producto</span>
                      <Badge variant="outline" className="text-[10px] font-normal text-gray-400">
                        {visible.length}
                      </Badge>
                    </div>
                  </th>

                  {/* 4 columnas de clasificación con combo + guardar */}
                  {COLS.map(col => (
                    <th key={col.type} className="px-2 py-2 min-w-[180px]">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">
                          {col.label}
                        </span>
                        <div className="flex items-center gap-1">
                          <Select
                            value={bulkVal[col.type]}
                            onValueChange={v => setBulkVal(prev => ({ ...prev, [col.type]: v }))}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1 bg-white border-gray-200">
                              <SelectValue placeholder="Elegir…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>
                                <span className="italic text-gray-400">Sin asignar</span>
                              </SelectItem>
                              {lookups[col.type].map(item => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                  {item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Guardar bulk */}
                          <Button
                            size="icon" variant="default"
                            className="h-7 w-7 shrink-0 bg-violet-600 hover:bg-violet-700"
                            title={`Aplicar ${col.label} a seleccionados`}
                            disabled={bulkSaving[col.type] || !someSelected}
                            onClick={() => handleBulkApply(col)}
                          >
                            {bulkSaving[col.type]
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Save    className="h-3.5 w-3.5" />
                            }
                          </Button>

                          {/* Alta rápida */}
                          <Button
                            size="icon" variant="outline"
                            className="h-7 w-7 shrink-0 border-gray-200"
                            title={`Nueva ${col.label.toLowerCase()}`}
                            onClick={() => setDialog({ type: col.type, newName: '', saving: false })}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Filas de productos */}
              <tbody className="divide-y divide-gray-100">
                {visible.map(p => {
                  const { filled, complete } = completeness(p)
                  const isSel = selected.has(p.id)

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors cursor-pointer
                        ${isSel
                          ? 'bg-violet-50 hover:bg-violet-100/70'
                          : 'hover:bg-gray-50'
                        }`}
                      onClick={() => toggleOne(p.id)}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                          checked={isSel}
                          onChange={() => toggleOne(p.id)}
                        />
                      </td>

                      {/* Nombre */}
                      <td className="px-3 py-2.5">
                        <p className={`font-medium text-sm ${isSel ? 'text-violet-900' : 'text-gray-900'}`}>
                          {p.name}
                        </p>
                        {p.description && (
                          <p className="text-xs text-gray-400 truncate max-w-xs">{p.description}</p>
                        )}
                        <span className={`text-[10px] ${complete ? 'text-green-500' : 'text-amber-500'}`}>
                          {filled}/4 {complete ? '✓ completo' : 'incompleto'}
                        </span>
                      </td>

                      {/* Valores actuales (solo lectura) */}
                      {COLS.map(col => {
                        const name = p[col.nameField as keyof Product] as string | null
                        return (
                          <td key={col.type} className="px-2 py-2.5">
                            {name
                              ? <Badge variant="outline" className="text-[11px] text-gray-600 border-gray-300">
                                  {name}
                                </Badge>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Diálogo alta rápida ───────────────────────────────────────────────── */}
      {dialog && (
        <Dialog open onOpenChange={() => setDialog(null)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>
                Nueva {COLS.find(c => c.type === dialog.type)?.label}
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-1.5">
              <Label>{COLS.find(c => c.type === dialog.type)?.label} *</Label>
              <Input
                autoFocus
                placeholder="Nombre…"
                value={dialog.newName}
                onChange={e => setDialog(d => d ? { ...d, newName: e.target.value } : null)}
                onKeyDown={e => e.key === 'Enter' && saveNewLookup()}
              />
              <p className="text-xs text-gray-400">
                Al crear, el valor quedará pre-seleccionado en el combo del encabezado.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
              <Button onClick={saveNewLookup} disabled={!dialog.newName.trim() || dialog.saving}>
                {dialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
