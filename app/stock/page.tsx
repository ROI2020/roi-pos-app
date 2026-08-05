'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Warehouse, ChevronDown, ChevronRight, Loader2,
  Package, Layers, Tag, LayoutGrid,
} from 'lucide-react'
import { Badge  } from '@/components/ui/badge'
import { Label  } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface LookupItem { id: number; name: string }

interface StockRow {
  category:     string
  age_group:    string
  season:       string
  gender:       string
  product_id:   number
  product_name: string
  color:        string
  size:         string
  stock:        number
}

interface ProductColorRow {
  product_id:   number
  product_name: string
  color:        string
  sizes:        Record<string, number>  // size → stock
  total:        number
}

interface CategoryGroup {
  category:    string
  rows:        ProductColorRow[]
  totalStock:  number
  totalColors: number
  totalProds:  number
}

// ── Orden de talles ────────────────────────────────────────────────────────────
const ALPHA_SIZE_ORDER = [
  'XXS','XS','S','M','L','XL','XXL','XXXL','XXXXL','ÚNICO','X','VARIOS'
]

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const aN = parseInt(a), bN = parseInt(b)
    if (!isNaN(aN) && !isNaN(bN)) return aN - bN
    if (!isNaN(aN)) return -1   // numérico antes que alfanumérico
    if (!isNaN(bN)) return 1
    const aI = ALPHA_SIZE_ORDER.indexOf(a.toUpperCase())
    const bI = ALPHA_SIZE_ORDER.indexOf(b.toUpperCase())
    if (aI !== -1 && bI !== -1) return aI - bI
    if (aI !== -1) return -1
    if (bI !== -1) return 1
    return a.localeCompare(b)
  })
}

// ── Helper numérico ────────────────────────────────────────────────────────────
const fmtN = (n: number) => new Intl.NumberFormat('es-AR').format(n)

// ── Componente principal ───────────────────────────────────────────────────────
export default function StockPage() {
  // ── Lookups ────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<LookupItem[]>([])
  const [ageGroups,  setAgeGroups ] = useState<LookupItem[]>([])
  const [seasons,    setSeasons   ] = useState<LookupItem[]>([])
  const [genders,    setGenders   ] = useState<LookupItem[]>([])

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState('__all__')
  const [ageGroupId, setAgeGroupId] = useState('__all__')
  const [seasonId,   setSeasonId  ] = useState('__all__')
  const [genderId,   setGenderId  ] = useState('__all__')

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [rows,     setRows    ] = useState<StockRow[] | null>(null)
  const [loading,  setLoading ] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // ── Carga lookups ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/age-groups').then(r => r.json()),
      fetch('/api/seasons').then(r    => r.json()),
      fetch('/api/genders').then(r    => r.json()),
    ]).then(([cats, ages, seas, gens]) => {
      setCategories(cats)
      setAgeGroups(ages)
      setSeasons(seas)
      setGenders(gens)
    }).catch(() => {})
  }, [])

  // ── Fetch stock ────────────────────────────────────────────────────────────
  const load = useCallback(async (catId: string, ageId: string, seaId: string, genId: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (catId !== '__all__') qs.set('category_id',  catId)
      if (ageId !== '__all__') qs.set('age_group_id', ageId)
      if (seaId !== '__all__') qs.set('season_id',    seaId)
      if (genId !== '__all__') qs.set('gender_id',    genId)

      const data: StockRow[] = await fetch(
        `/api/reports/stock-by-category${qs.toString() ? '?' + qs : ''}`
      ).then(r => r.json())
      setRows(Array.isArray(data) ? data : [])
      // Expandir todas las categorías por defecto
      const cats = new Set(data.map(r => r.category))
      setExpanded(cats)
    } catch { setRows([]) }
    finally  { setLoading(false) }
  }, [])

  // Auto-fetch al cambiar filtros
  useEffect(() => {
    load(categoryId, ageGroupId, seasonId, genderId)
  }, [categoryId, ageGroupId, seasonId, genderId, load])

  // ── Agrupación ─────────────────────────────────────────────────────────────
  const { groups, allSizes } = useMemo(() => {
    if (!rows) return { groups: [], allSizes: [] }

    // Recopilar todos los talles únicos
    const sizeSet = new Set<string>()
    rows.forEach(r => sizeSet.add(r.size))
    const allSizes = sortSizes([...sizeSet])

    // Agrupar: category → (product_id, color) → sizes
    const catMap = new Map<string, Map<string, ProductColorRow>>()

    for (const r of rows) {
      if (!catMap.has(r.category)) catMap.set(r.category, new Map())
      const prodMap = catMap.get(r.category)!

      const key = `${r.product_id}||${r.color}`
      if (!prodMap.has(key)) {
        prodMap.set(key, {
          product_id:   r.product_id,
          product_name: r.product_name,
          color:        r.color,
          sizes:        {},
          total:        0,
        })
      }
      const row = prodMap.get(key)!
      row.sizes[r.size] = (row.sizes[r.size] ?? 0) + r.stock
      row.total += r.stock
    }

    const groups: CategoryGroup[] = []
    for (const [category, prodMap] of catMap) {
      const prodRows = [...prodMap.values()]
      const totalStock  = prodRows.reduce((s, r) => s + r.total, 0)
      const prodIds     = new Set(prodRows.map(r => r.product_id))
      groups.push({
        category,
        rows:        prodRows,
        totalStock,
        totalColors: prodRows.length,
        totalProds:  prodIds.size,
      })
    }

    return { groups, allSizes }
  }, [rows])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    totalStock:  groups.reduce((s, g) => s + g.totalStock,  0),
    totalCats:   groups.length,
    totalProds:  groups.reduce((s, g) => s + g.totalProds,  0),
    totalColors: groups.reduce((s, g) => s + g.totalColors, 0),
  }), [groups])

  const toggle = (cat: string) =>
    setExpanded(prev => {
      const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n
    })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-full mx-auto space-y-6">

        {/* Encabezado */}
        <div className="flex items-center gap-3">
          <Warehouse className="h-6 w-6 text-violet-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock por Categoría</h1>
            <p className="text-sm text-gray-500">Unidades disponibles en todas las sucursales</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Categoría</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    <span className="italic text-gray-400">Todas</span>
                  </SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Edad</Label>
              <Select value={ageGroupId} onValueChange={setAgeGroupId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    <span className="italic text-gray-400">Todas</span>
                  </SelectItem>
                  {ageGroups.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Temporada</Label>
              <Select value={seasonId} onValueChange={setSeasonId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    <span className="italic text-gray-400">Todas</span>
                  </SelectItem>
                  {seasons.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Género</Label>
              <Select value={genderId} onValueChange={setGenderId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    <span className="italic text-gray-400">Todos</span>
                  </SelectItem>
                  {genders.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>

        {/* KPIs */}
        {rows !== null && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Unidades en stock', value: fmtN(kpis.totalStock),  Icon: Package,     color: 'text-violet-600 bg-violet-50'  },
              { label: 'Categorías',         value: fmtN(kpis.totalCats),   Icon: Layers,      color: 'text-sky-600    bg-sky-50'     },
              { label: 'Productos únicos',   value: fmtN(kpis.totalProds),  Icon: Tag,         color: 'text-amber-600  bg-amber-50'   },
              { label: 'Variantes (color)',  value: fmtN(kpis.totalColors), Icon: LayoutGrid,  color: 'text-emerald-600 bg-emerald-50'},
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${c.color.split(' ')[1]}`}>
                  <c.Icon className={`h-5 w-5 ${c.color.split(' ')[0]}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">{c.label}</p>
                  <p className="text-xl font-bold text-gray-900">{c.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Estado de carga / vacío */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          </div>
        )}

        {!loading && rows !== null && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <Warehouse className="h-10 w-10" />
            <p className="text-sm">No hay stock disponible con los filtros seleccionados</p>
          </div>
        )}

        {/* Tabla */}
        {!loading && groups.length > 0 && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="w-8 px-3 py-3" />
                    <th className="px-3 py-3 text-left min-w-[180px]">Producto</th>
                    <th className="px-3 py-3 text-left min-w-[100px]">Color</th>
                    {allSizes.map(sz => (
                      <th key={sz} className="px-2 py-3 text-center min-w-[44px]">{sz}</th>
                    ))}
                    <th className="px-3 py-3 text-right font-semibold text-gray-700 min-w-[60px] bg-gray-100/60">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groups.map(g => {
                    const open = expanded.has(g.category)
                    return (
                      <>
                        {/* Fila de categoría */}
                        <tr
                          key={`cat-${g.category}`}
                          className="bg-violet-50/60 hover:bg-violet-100/50 cursor-pointer select-none transition-colors"
                          onClick={() => toggle(g.category)}
                        >
                          <td className="px-3 py-3 text-violet-400">
                            {open
                              ? <ChevronDown  className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />
                            }
                          </td>
                          <td
                            colSpan={2 + allSizes.length}
                            className="px-3 py-3 font-semibold text-violet-800"
                          >
                            {g.category}
                            <span className="ml-3 text-xs font-normal text-violet-500 space-x-2">
                              <Badge variant="outline" className="border-violet-200 text-violet-600 text-[10px] px-1.5 py-0">
                                {g.totalProds} producto{g.totalProds !== 1 ? 's' : ''}
                              </Badge>
                              <Badge variant="outline" className="border-violet-200 text-violet-600 text-[10px] px-1.5 py-0">
                                {g.totalColors} variante{g.totalColors !== 1 ? 's' : ''}
                              </Badge>
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-violet-800 bg-violet-100/40">
                            {fmtN(g.totalStock)}
                          </td>
                        </tr>

                        {/* Filas de producto+color */}
                        {open && (() => {
                          // Agrupar visualmente: mostrar nombre solo en primera fila del producto
                          let lastProductId: number | null = null
                          return g.rows.map((row, idx) => {
                            const showName = row.product_id !== lastProductId
                            lastProductId = row.product_id
                            return (
                              <tr
                                key={`${row.product_id}-${row.color}-${idx}`}
                                className="hover:bg-gray-50/60 transition-colors"
                              >
                                <td className="px-3 py-2" />
                                {/* Nombre del producto: solo en primera fila del grupo */}
                                <td className="px-3 py-2 text-gray-800 truncate max-w-[180px]">
                                  {showName
                                    ? <span className="font-medium">{row.product_name}</span>
                                    : <span className="text-gray-300 select-none">↳</span>
                                  }
                                </td>
                                <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                                  {row.color}
                                </td>
                                {allSizes.map(sz => (
                                  <td key={sz} className="px-2 py-2 text-center">
                                    {(row.sizes[sz] ?? 0) > 0
                                      ? <span className="font-medium text-gray-800">{row.sizes[sz]}</span>
                                      : <span className="text-gray-200">—</span>
                                    }
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-right font-semibold text-gray-800 bg-gray-50">
                                  {fmtN(row.total)}
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </>
                    )
                  })}
                </tbody>

                {/* Fila de totales */}
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 text-gray-700 font-bold">
                    <td />
                    <td colSpan={2 + allSizes.length} className="px-3 py-3 text-xs uppercase tracking-wide text-gray-500">
                      Total general — {groups.length} categoría{groups.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-3 py-3 text-right bg-gray-100 text-gray-800 text-base">
                      {fmtN(kpis.totalStock)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
