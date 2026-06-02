"use client"

import { useState, useRef, useCallback } from "react"
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Loader2, ChevronDown, ChevronRight, Info, Package,
  Tags, Boxes, Warehouse,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge }  from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ── Types ──────────────────────────────────────────────────────────────────────
interface VariantSpec {
  size: string; color: string; stock: number; sku_hint: string | null
}
interface ProductGroup {
  base_name: string; category_name: string | null; description: string | null
  base_price: number; unit_cost: number; variants: VariantSpec[]
}
interface PreviewStats {
  total_rows: number; total_products: number; total_variants: number
  total_inventory: number; cats_new_count: number; cats_new: string[]
}
interface PreviewResult {
  groups: ProductGroup[]; stats: PreviewStats
  branches: { id: number; name: string }[]
}
interface ImportResult {
  purchase_id: number; products_created: number; variants_created: number
  inventory_created: number; categories_created: number
  total_amount: number; message: string; errors: string[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

// ── Modelo de datos ────────────────────────────────────────────────────────────
const COLUMNS = [
  { name: 'Nombre',        required: true,  map: 'Nombre del producto. Si tiene formato "Producto - Talle" (ej: "Camiseta - 10"), se agrupa automáticamente como variantes del mismo producto.' },
  { name: 'Categoría',     required: false, map: 'Nombre de la categoría. Se crea automáticamente si no existe.' },
  { name: 'Código',        required: false, map: 'SKU o código propio. Se genera automáticamente si está vacío.' },
  { name: 'Descripción',   required: false, map: 'Descripción del producto.' },
  { name: 'Costo unitario',required: false, map: 'Precio de costo por unidad. Se usa para registrar la compra de migración.' },
  { name: 'Precio',        required: true,  map: 'Precio de venta al público.' },
  { name: 'Stock actual',  required: false, map: 'Unidades en inventario. Stock > 1 en un producto sin talle genera N variantes individuales.' },
]

// ── Componente ─────────────────────────────────────────────────────────────────
export default function ImportacionPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging,    setDragging   ] = useState(false)
  const [fileName,    setFileName   ] = useState<string | null>(null)
  const [previewing,  setPreviewing ] = useState(false)
  const [preview,     setPreview    ] = useState<PreviewResult | null>(null)
  const [branchId,    setBranchId   ] = useState<string>('')
  const [expanded,    setExpanded   ] = useState<Set<number>>(new Set())
  const [importing,   setImporting  ] = useState(false)
  const [result,      setResult     ] = useState<ImportResult | null>(null)
  const [error,       setError      ] = useState<string | null>(null)

  // ── Upload / preview ─────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Solo se aceptan archivos Excel (.xlsx / .xls)')
      return
    }
    setFileName(file.name)
    setPreview(null); setResult(null); setError(null)
    setPreviewing(true)

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res  = await fetch('/api/migrate/preview', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(data)
      // Pre-seleccionar sucursal si hay una que dice "197" o "Malema"
      const branch = data.branches.find((b: { id: number; name: string }) =>
        b.name.includes('197') || b.name.toLowerCase().includes('malema')
      )
      if (branch) setBranchId(String(branch.id))
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setPreviewing(false)
    }
  }, [])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!preview || !branchId) return
    setImporting(true); setError(null)
    try {
      const res  = await fetch('/api/migrate/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: preview.groups, branch_id: parseInt(branchId) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setPreview(null)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const toggleExpand = (i: number) =>
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(i) ? s.delete(i) : s.add(i)
      return s
    })

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-violet-600" />
          Importación de Productos
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Importá hasta 500+ productos desde un archivo Excel. Revisá la vista previa antes de confirmar.
        </p>
      </div>

      {/* ── Modelo de datos ───────────────────────────────────────────────────── */}
      <section className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex items-center gap-2 border-b">
          <Info className="h-4 w-4 text-violet-500 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-700">Formato esperado del archivo Excel</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-600 w-40">Columna</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 w-20">Requerida</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {COLUMNS.map(col => (
                <tr key={col.name} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-violet-700">{col.name}</td>
                  <td className="px-4 py-2.5">
                    {col.required
                      ? <Badge className="bg-violet-100 text-violet-700 text-[10px]">Requerida</Badge>
                      : <span className="text-xs text-gray-400">Opcional</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{col.map}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-amber-50 border-t border-amber-100 px-4 py-2.5 text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Las columnas adicionales (Precio de promoción, Mostrar en catálogo, Destacar, Fracción, Controlar stock, Stock mínimo) se ignoran en esta importación.
            Se creará automáticamente un proveedor <strong>"Migración"</strong> y una compra <strong>"Migración de Productos"</strong>.
          </span>
        </div>
      </section>

      {/* ── Zona de carga ─────────────────────────────────────────────────────── */}
      {!result && (
        <section>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
              ${dragging ? 'border-violet-400 bg-violet-50' : 'border-gray-300 hover:border-violet-300 hover:bg-gray-50'}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            {fileName
              ? <p className="text-sm font-medium text-violet-700">{fileName}</p>
              : <p className="text-sm text-gray-500">Arrastrá el archivo acá o <span className="text-violet-600 font-medium">hacé clic para elegir</span></p>
            }
            <p className="text-xs text-gray-400 mt-1">Solo archivos .xlsx · máx. 528 filas aprox.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />
          </div>
        </section>
      )}

      {/* ── Cargando preview ──────────────────────────────────────────────────── */}
      {previewing && (
        <div className="flex items-center gap-3 text-gray-500 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          <span className="text-sm">Analizando archivo…</span>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Vista previa ──────────────────────────────────────────────────────── */}
      {preview && (
        <section className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-800">Vista previa</h2>

          {/* Resumen chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Productos',        value: preview.stats.total_products,  icon: Package,    color: 'text-violet-600 bg-violet-50 border-violet-200' },
              { label: 'Variantes',        value: preview.stats.total_variants,  icon: Boxes,      color: 'text-blue-600   bg-blue-50   border-blue-200'   },
              { label: 'En inventario',    value: preview.stats.total_inventory, icon: Warehouse,  color: 'text-green-600  bg-green-50  border-green-200'  },
              { label: 'Categ. nuevas',    value: preview.stats.cats_new_count,  icon: Tags,       color: 'text-amber-600  bg-amber-50  border-amber-200'  },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${color}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-xl font-bold leading-none">{value}</p>
                  <p className="text-xs mt-0.5 opacity-70">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Categorías nuevas */}
          {preview.stats.cats_new.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex flex-wrap gap-1.5 items-center">
              <span className="font-medium">Categorías a crear:</span>
              {preview.stats.cats_new.map(c => (
                <Badge key={c} variant="outline" className="text-amber-700 border-amber-300 text-[10px]">{c}</Badge>
              ))}
            </div>
          )}

          {/* Selector de sucursal */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 shrink-0">Sucursal destino:</label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-64 h-9 text-sm">
                <SelectValue placeholder="Seleccioná una sucursal…" />
              </SelectTrigger>
              <SelectContent>
                {preview.branches.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabla de grupos */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-600 w-8"></th>
                  <th className="px-4 py-2.5 font-medium text-gray-600">Producto</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600">Categoría</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Variantes</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Stock</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Precio</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.groups.map((g, i) => (
                  <>
                    <tr
                      key={i}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(i)}
                    >
                      <td className="px-3 py-2.5 text-gray-400">
                        {expanded.has(i)
                          ? <ChevronDown  className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />
                        }
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{g.base_name}</td>
                      <td className="px-4 py-2.5">
                        {g.category_name
                          ? <Badge variant="outline" className="text-[10px] text-gray-600">{g.category_name}</Badge>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{g.variants.length}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {g.variants.filter(v => v.stock > 0).length}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmt(g.base_price)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{g.unit_cost > 0 ? fmt(g.unit_cost) : '—'}</td>
                    </tr>
                    {expanded.has(i) && (
                      <tr key={`${i}-detail`} className="bg-gray-50">
                        <td colSpan={7} className="px-6 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {g.variants.map((v, j) => (
                              <span
                                key={j}
                                className={`inline-flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5
                                  ${v.stock > 0
                                    ? 'border-green-300 bg-green-50 text-green-700'
                                    : 'border-gray-200 bg-white text-gray-400'
                                  }`}
                              >
                                T.{v.size}
                                {v.stock > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Botón importar */}
          <div className="flex items-center gap-4 pt-2">
            <Button
              className="gap-2 h-11 px-6"
              disabled={!branchId || importing}
              onClick={handleImport}
            >
              {importing
                ? <><Loader2 className="h-4 w-4 animate-spin" />Importando…</>
                : <><Upload className="h-4 w-4" />Importar {preview.stats.total_products} productos</>
              }
            </Button>
            <p className="text-xs text-gray-400">
              {!branchId && <span className="text-orange-500">Seleccioná una sucursal antes de importar.</span>}
              {branchId  && 'Esta acción no se puede deshacer fácilmente.'}
            </p>
          </div>
        </section>
      )}

      {/* ── Resultado ─────────────────────────────────────────────────────────── */}
      {result && (
        <section className="space-y-4">
          <div className={`flex items-start gap-3 rounded-xl border px-5 py-4
            ${result.errors.length === 0
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {result.errors.length === 0
              ? <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-green-600" />
              : <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
            }
            <div>
              <p className="font-semibold">{result.message}</p>
              <p className="text-sm mt-0.5 opacity-80">Compra #{result.purchase_id} registrada.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {[
              { label: 'Productos creados',    value: result.products_created   },
              { label: 'Variantes creadas',    value: result.variants_created   },
              { label: 'Prendas en inventario',value: result.inventory_created  },
              { label: 'Categorías creadas',   value: result.categories_created },
              { label: 'Total costo compra',   value: fmt(result.total_amount)  },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-bold text-gray-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="border border-red-200 rounded-xl overflow-hidden">
              <div className="bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 border-b border-red-200">
                {result.errors.length} producto(s) con error
              </div>
              <ul className="divide-y divide-red-100">
                {result.errors.map((e, i) => (
                  <li key={i} className="px-4 py-2 text-xs text-red-600 font-mono">{e}</li>
                ))}
              </ul>
            </div>
          )}

          <Button
            variant="outline"
            onClick={() => { setResult(null); setFileName(null); setPreview(null); setError(null) }}
          >
            Nueva importación
          </Button>
        </section>
      )}
    </main>
  )
}
