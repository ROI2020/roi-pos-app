"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Plus, Warehouse, Loader2, Search, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight,
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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Branch    { id: number; name: string; address: string | null; arca_pos_number: number }
interface LookupItem { id: number; name: string }

interface Variant {
  id: number; sku: string; color: string; size: string
  product_id: number; product_name: string
  category_id:  number | null; category_name:  string | null
  age_group_id: number | null; age_group_name: string | null
  season_id:    number | null; season_name:    string | null
  gender_id:    number | null; gender_name:    string | null
  current_branch_id:   number | null
  current_branch_name: string | null
}

interface Group {
  key: string
  product_id: number; product_name: string
  color: string
  items: Variant[]
}

type Mode = 'asign' | 'reassign'

// ── Componente ─────────────────────────────────────────────────────────────────
export default function AssignInventory() {
  // ── Lookups ────────────────────────────────────────────────────────────────
  const [branches,  setBranches ] = useState<Branch[]>([])
  const [categories,setCategories] = useState<LookupItem[]>([])
  const [ageGroups, setAgeGroups ] = useState<LookupItem[]>([])
  const [seasons,   setSeasons   ] = useState<LookupItem[]>([])
  const [genders,   setGenders   ] = useState<LookupItem[]>([])

  // ── Modo & filtros ─────────────────────────────────────────────────────────
  const [mode,          setMode         ] = useState<Mode>('asign')
  const [sourceBranchId,setSourceBranchId] = useState<string>('__none__')
  const [targetBranchId,setTargetBranchId] = useState<string>('__none__')
  const [categoryId,    setCategoryId   ] = useState<string>('__all__')
  const [ageGroupId,    setAgeGroupId   ] = useState<string>('__all__')
  const [seasonId,      setSeasonId     ] = useState<string>('__all__')
  const [genderId,      setGenderId     ] = useState<string>('__all__')
  const [colorFilter,   setColorFilter  ] = useState<string>('')

  // ── Resultados ─────────────────────────────────────────────────────────────
  const [variants,  setVariants ] = useState<Variant[] | null>(null) // null = sin búsqueda
  const [searching, setSearching] = useState(false)
  const [assigning, setAssigning] = useState(false)

  // ── Selección ──────────────────────────────────────────────────────────────
  const [selected,       setSelected      ] = useState<Set<number>>(new Set())
  const [collapsedGroups,setCollapsedGroups] = useState<Set<string>>(new Set())

  // ── Diálogo nueva sucursal ─────────────────────────────────────────────────
  const [branchDialog, setBranchDialog] = useState<{
    open: boolean; name: string; address: string; arca_pos_number: string; saving: boolean
  } | null>(null)

  // ── Carga de lookups ───────────────────────────────────────────────────────
  const loadLookups = useCallback(async () => {
    try {
      const [bs, cats, ages, seas, gens] = await Promise.all([
        fetch('/api/branches').then(r  => r.json()),
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/age-groups').then(r => r.json()),
        fetch('/api/seasons').then(r   => r.json()),
        fetch('/api/genders').then(r   => r.json()),
      ])
      setBranches(bs)
      setCategories(cats)
      setAgeGroups(ages)
      setSeasons(seas)
      setGenders(gens)
    } catch {
      toast.error('Error al cargar listas de referencia')
    }
  }, [])

  useEffect(() => { loadLookups() }, [loadLookups])

  // Resetear resultados al cambiar de modo
  useEffect(() => {
    setVariants(null)
    setSelected(new Set())
    setCollapsedGroups(new Set())
    setSourceBranchId('__none__')
  }, [mode])

  // ── Grupos agrupados por producto + color ──────────────────────────────────
  const groups = useMemo((): Group[] => {
    if (!variants) return []
    const map = new Map<string, Group>()
    for (const v of variants) {
      const key = `${v.product_id}|${v.color}`
      if (!map.has(key)) {
        map.set(key, {
          key, product_id: v.product_id, product_name: v.product_name,
          color: v.color, items: [],
        })
      }
      map.get(key)!.items.push(v)
    }
    return [...map.values()]
  }, [variants])

  const tooMany = variants !== null && variants.length > 200

  // ── Búsqueda ───────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (mode === 'reassign' && sourceBranchId === '__none__') {
      toast.error('Seleccioná la sucursal de origen')
      return
    }

    setSearching(true)
    setVariants(null)
    setSelected(new Set())
    setCollapsedGroups(new Set())

    try {
      const qs = new URLSearchParams({ mode })
      if (mode === 'reassign') qs.set('current_branch_id', sourceBranchId)
      if (categoryId !== '__all__') qs.set('category_id', categoryId)
      if (ageGroupId !== '__all__') qs.set('age_group_id', ageGroupId)
      if (seasonId   !== '__all__') qs.set('season_id',    seasonId)
      if (genderId   !== '__all__') qs.set('gender_id',    genderId)
      if (colorFilter.trim())       qs.set('color',        colorFilter.trim())

      const res  = await fetch(`/api/inventory/variants?${qs}`)
      const data: Variant[] = await res.json()
      setVariants(data)

      if (data.length <= 200) {
        setSelected(new Set(data.map(v => v.id)))
      }
    } catch {
      toast.error('Error al buscar prendas')
    } finally {
      setSearching(false)
    }
  }, [mode, sourceBranchId, categoryId, ageGroupId, seasonId, genderId, colorFilter])

  // ── Selección ──────────────────────────────────────────────────────────────
  const toggleVariant = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleGroup = (group: Group) => {
    const ids      = group.items.map(i => i.id)
    const allOn    = ids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      allOn ? ids.forEach(id => next.delete(id)) : ids.forEach(id => next.add(id))
      return next
    })
  }

  const toggleCollapse = (key: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const selectAll   = () => setSelected(new Set(variants?.map(v => v.id) ?? []))
  const deselectAll = () => setSelected(new Set())

  // ── Asignación ─────────────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (targetBranchId === '__none__') { toast.error('Seleccioná la sucursal destino'); return }
    if (selected.size === 0)           { toast.error('No hay prendas seleccionadas');    return }

    setAssigning(true)
    try {
      const body: Record<string, unknown> = {
        variant_ids:      [...selected],
        target_branch_id: parseInt(targetBranchId),
        mode,
      }
      if (mode === 'reassign' && sourceBranchId !== '__none__') {
        body.source_branch_id = parseInt(sourceBranchId)
      }

      const res  = await fetch('/api/inventory/assign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const targetName = branches.find(b => b.id === parseInt(targetBranchId))?.name ?? targetBranchId
      const n = data.assigned as number
      toast.success(`${n} prenda${n !== 1 ? 's' : ''} asignada${n !== 1 ? 's' : ''} a "${targetName}"`)

      // Re-buscar para reflejar el cambio
      await handleSearch()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setAssigning(false)
    }
  }

  // ── Nueva sucursal ─────────────────────────────────────────────────────────
  const openBranchDialog = () =>
    setBranchDialog({ open: true, name: '', address: '', arca_pos_number: '0', saving: false })

  const saveNewBranch = async () => {
    if (!branchDialog) return
    if (!branchDialog.name.trim()) { toast.error('El nombre es obligatorio'); return }

    setBranchDialog(d => d ? { ...d, saving: true } : null)
    try {
      const res  = await fetch('/api/branches', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:            branchDialog.name.trim(),
          address:         branchDialog.address.trim() || null,
          arca_pos_number: parseInt(branchDialog.arca_pos_number) || 0,
        }),
      })
      const branch = await res.json()
      if (!res.ok) throw new Error(branch.error)

      setBranches(prev => [...prev, branch].sort((a, b) => a.name.localeCompare(b.name)))
      setTargetBranchId(String(branch.id))
      toast.success(`Sucursal "${branch.name}" creada`)
      setBranchDialog(null)
    } catch (err: unknown) {
      toast.error((err as Error).message)
      setBranchDialog(d => d ? { ...d, saving: false } : null)
    }
  }

  // Sucursales disponibles para origen (excluir la destino seleccionada)
  const sourceBranches = branches.filter(b =>
    targetBranchId === '__none__' || b.id !== parseInt(targetBranchId)
  )
  // Sucursales disponibles para destino (excluir la origen seleccionada)
  const targetBranches = branches.filter(b =>
    mode === 'asign' || sourceBranchId === '__none__' || b.id !== parseInt(sourceBranchId)
  )

  const targetName = branches.find(b => b.id === parseInt(targetBranchId))?.name

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Título ── */}
        <div className="flex items-center gap-3">
          <Warehouse className="h-6 w-6 text-violet-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Asignación de Stock</h1>
            <p className="text-sm text-gray-500">
              Asigná prendas a una sucursal o trasladalas de una a otra
            </p>
          </div>
        </div>

        {/* ── Toggle modo ── */}
        <div className="flex items-center gap-2 bg-white rounded-lg border px-3 py-1.5 w-fit">
          {(['asign', 'reassign'] as Mode[]).map(m => (
            <button
              key={m}
              className={`text-sm px-3 py-1 rounded-md transition-colors ${
                mode === m
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setMode(m)}
            >
              {m === 'asign' ? 'Asignación' : 'Reasignación'}
            </button>
          ))}
        </div>

        {/* ── Panel de filtros ── */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filtros</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Sucursal origen (solo reasignación) */}
            {mode === 'reassign' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Sucursal origen *</Label>
                <Select value={sourceBranchId} onValueChange={setSourceBranchId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Seleccioná origen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceBranches.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Sucursal destino + botón nueva */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Sucursal destino *</Label>
              <div className="flex gap-1.5">
                <Select value={targetBranchId} onValueChange={setTargetBranchId}>
                  <SelectTrigger className="flex-1 h-9 text-sm">
                    <SelectValue placeholder="Seleccioná destino…" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetBranches.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                  title="Nueva sucursal" onClick={openBranchDialog}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Categoría */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Categoría</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__"><span className="text-gray-400 italic">Todas</span></SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Edad */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Edad</Label>
              <Select value={ageGroupId} onValueChange={setAgeGroupId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__"><span className="text-gray-400 italic">Todos</span></SelectItem>
                  {ageGroups.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Temporada */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Temporada</Label>
              <Select value={seasonId} onValueChange={setSeasonId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__"><span className="text-gray-400 italic">Todas</span></SelectItem>
                  {seasons.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Género */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Género</Label>
              <Select value={genderId} onValueChange={setGenderId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__"><span className="text-gray-400 italic">Todos</span></SelectItem>
                  {genders.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Color</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ej: negro, rojo…"
                value={colorFilter}
                onChange={e => setColorFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Botón buscar */}
          <div className="flex justify-end pt-1">
            <Button onClick={handleSearch} disabled={searching} className="gap-2">
              {searching
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Search className="h-4 w-4" />
              }
              Buscar prendas
            </Button>
          </div>
        </div>

        {/* ── Resultados ── */}
        {variants !== null && (
          <div className="space-y-3">

            {/* Advertencia: demasiados resultados */}
            {tooMany ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3 items-start">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800">Demasiados resultados</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    Hay más de 200 prendas que coinciden con los filtros actuales.
                    Agregá más filtros (categoría, temporada, género, color o sucursal)
                    para acotar la búsqueda y poder asignar el stock.
                  </p>
                </div>
              </div>
            ) : variants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <p className="font-medium text-gray-600">
                  {mode === 'asign'
                    ? '¡No hay prendas sin asignar con esos filtros!'
                    : 'No hay prendas en esa sucursal con esos filtros.'}
                </p>
              </div>
            ) : (
              <>
                {/* Encabezado de resultados */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-500">
                    {variants.length} prenda{variants.length !== 1 ? 's' : ''} encontrada{variants.length !== 1 ? 's' : ''}
                    {' · '}
                    <span className="font-medium text-gray-700">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAll}>
                      Seleccionar todo
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAll}>
                      Limpiar selección
                    </Button>
                  </div>
                </div>

                {/* Lista agrupada */}
                <div className="space-y-2">
                  {groups.map(group => {
                    const collapsed   = collapsedGroups.has(group.key)
                    const groupIds    = group.items.map(i => i.id)
                    const allSelected = groupIds.every(id => selected.has(id))
                    const someSelected = groupIds.some(id => selected.has(id))

                    return (
                      <div
                        key={group.key}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                      >
                        {/* Cabecera del grupo */}
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
                          onClick={() => toggleCollapse(group.key)}
                        >
                          {/* Checkbox grupo */}
                          <div
                            onClick={e => { e.stopPropagation(); toggleGroup(group) }}
                            className="shrink-0"
                          >
                            <Checkbox
                              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">
                              {group.product_name}
                            </p>
                            <p className="text-xs text-gray-500">{group.color}</p>
                          </div>

                          <Badge variant="outline" className="text-xs shrink-0">
                            {group.items.length} prenda{group.items.length !== 1 ? 's' : ''}
                          </Badge>

                          {collapsed
                            ? <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                            : <ChevronDown  className="h-4 w-4 text-gray-400 shrink-0" />
                          }
                        </div>

                        {/* Filas de talles */}
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
                                  {v.sku}
                                </span>
                                {mode === 'reassign' && v.current_branch_name && (
                                  <Badge variant="outline" className="text-xs shrink-0 border-orange-200 text-orange-600">
                                    {v.current_branch_name}
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
                    {' '}prenda{selected.size !== 1 ? 's' : ''} seleccionada{selected.size !== 1 ? 's' : ''}
                    {targetName && (
                      <> → <span className="font-medium">"{targetName}"</span></>
                    )}
                  </p>
                  <Button
                    onClick={handleAssign}
                    disabled={selected.size === 0 || targetBranchId === '__none__' || assigning}
                    className="gap-2"
                  >
                    {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === 'asign' ? 'Asignar' : 'Reasignar'} seleccionadas
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ Diálogo nueva sucursal ════════════════════════════════════════════ */}
      {branchDialog && (
        <Dialog open={branchDialog.open} onOpenChange={() => setBranchDialog(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Nueva Sucursal</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  autoFocus
                  placeholder="Ej: Centro, Norte…"
                  value={branchDialog.name}
                  onChange={e => setBranchDialog(d => d ? { ...d, name: e.target.value } : null)}
                  onKeyDown={e => e.key === 'Enter' && saveNewBranch()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input
                  placeholder="Opcional"
                  value={branchDialog.address}
                  onChange={e => setBranchDialog(d => d ? { ...d, address: e.target.value } : null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Número ARCA (POS) *</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={branchDialog.arca_pos_number}
                  onChange={e => setBranchDialog(d => d ? { ...d, arca_pos_number: e.target.value } : null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBranchDialog(null)}>
                Cancelar
              </Button>
              <Button
                onClick={saveNewBranch}
                disabled={!branchDialog.name.trim() || branchDialog.saving}
              >
                {branchDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Crear sucursal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
