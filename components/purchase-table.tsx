"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Plus, Trash2, ShoppingBag, Loader2, ChevronsUpDown, Check, BarChart2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { parseTalles } from "@/lib/talles"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Supplier {
  id: string
  company_name: string
  cuit: string
  phone: string
}

interface Product {
  id: string
  name: string
  description: string
  base_price: number
}

interface Category {
  id: string
  name: string
}

interface ColorCurvaLine {
  id: string
  color: string
  curvas: string
  curva_sizes: string
}

interface PurchaseDetailLine {
  id: string
  product_id: string
  unit_cost: string
  colorCurvaLines: ColorCurvaLine[]
}

interface PurchaseForm {
  supplier_id: string
  invoice_number: string
  purchase_date: string
  title: string
  details: PurchaseDetailLine[]
}

interface StockRow {
  edad: string
  talle: string
  [genero: string]: string | number
}

// ── Componente ─────────────────────────────────────────────────────────────────
export default function PurchaseTable() {
  const counter = useRef(0)
  const uid = () => `id-${++counter.current}`

  const emptyLine = (): ColorCurvaLine => ({
    id: uid(), color: "", curvas: "1", curva_sizes: "",
  })
  const emptyDetail = (): PurchaseDetailLine => ({
    id: uid(), product_id: "", unit_cost: "", colorCurvaLines: [emptyLine()],
  })

  // ── Estado del formulario ──────────────────────────────────────────────────
  const [form, setForm] = useState<PurchaseForm>(() => ({
    supplier_id: "",
    invoice_number: "",
    purchase_date: "",
    title: "",
    details: [emptyDetail()],
  }))

  useEffect(() => {
    setForm(f => ({ ...f, purchase_date: new Date().toISOString().split("T")[0] }))
  }, [])

  // ── Datos de la base de datos ──────────────────────────────────────────────
  const [suppliers, setSuppliers]   = useState<Supplier[]>([])
  const [products, setProducts]     = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [supRes, prodRes, catRes] = await Promise.all([
          fetch("/api/suppliers"),
          fetch("/api/products?sort=name_asc&limit=2000"),
          fetch("/api/categories"),
        ])
        if (supRes.ok)  setSuppliers(await supRes.json())
        if (prodRes.ok) setProducts(await prodRes.json())
        if (catRes.ok)  setCategories(await catRes.json())
      } catch {
        toast.error("No se pudo conectar con la base de datos")
      } finally {
        setLoadingData(false)
      }
    }
    load()
  }, [])

  // ── Diálogos ────────────────────────────────────────────────────────────────
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [productOpen,  setProductOpen]  = useState(false)
  const [stockOpen,    setStockOpen]    = useState(false)
  const [targetDetailId, setTargetDetailId] = useState<string | null>(null)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [savingProduct,  setSavingProduct]  = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Combobox de productos (uno por detalle) ────────────────────────────────
  const [comboOpen, setComboOpen] = useState<Record<string, boolean>>({})
  const [productSearch, setProductSearch] = useState("")

  const toggleCombo = (id: string, val: boolean) => {
    setComboOpen(p => ({ ...p, [id]: val }))
    if (!val) setProductSearch("") // limpiar búsqueda al cerrar
  }

  // Normaliza texto quitando tildes para búsqueda tolerante (vestido = vestidó)
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

  // Sin texto: muestra los primeros 30 para no saturar el DOM
  // Con texto: filtra sobre toda la lista en memoria (instantáneo)
  const filteredProducts = productSearch.trim()
    ? products.filter(p => normalize(p.name).includes(normalize(productSearch)))
    : products.slice(0, 30)

  // ── Nuevo proveedor / producto ─────────────────────────────────────────────
  const [newSup,  setNewSup]  = useState<Omit<Supplier, "id">>({ company_name: "", cuit: "", phone: "" })
  const [newProd, setNewProd] = useState<Omit<Product, "id">>({ name: "", description: "", base_price: 0 })

  // ── Modal stock por categoría ──────────────────────────────────────────────
  const [stockCatId,    setStockCatId]    = useState<string>("")
  const [stockLoading,  setStockLoading]  = useState(false)
  const [stockGenders,  setStockGenders]  = useState<string[]>([])
  const [stockRows,     setStockRows]     = useState<StockRow[]>([])

  const loadStockCategoria = useCallback(async (catId: string) => {
    if (!catId) return
    setStockLoading(true)
    setStockGenders([])
    setStockRows([])
    try {
      const res = await fetch(`/api/reports/stock-categoria?category_id=${catId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStockGenders(data.genders)
      setStockRows(data.rows)
    } catch {
      toast.error("Error al cargar el stock")
    } finally {
      setStockLoading(false)
    }
  }, [])

  // ── Helpers de cantidad ────────────────────────────────────────────────────
  const lineQty = (line: ColorCurvaLine) => {
    const curvas = parseInt(line.curvas) || 0
    return curvas * parseTalles(line.curva_sizes).length
  }

  const total = useMemo(() =>
    form.details.reduce((sum, d) => {
      const cost = parseFloat(d.unit_cost) || 0
      return sum + d.colorCurvaLines.reduce((s, l) => s + lineQty(l) * cost, 0)
    }, 0),
    [form.details] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── Encabezado ─────────────────────────────────────────────────────────────
  const setHeader = (field: keyof Omit<PurchaseForm, "details">, value: string) =>
    setForm(p => ({ ...p, [field]: value }))

  // ── Selección de producto + sugerencia de último costo ────────────────────
  const handleProductSelect = async (detailId: string, productId: string) => {
    setDetailField(detailId, "product_id", productId)
    toggleCombo(detailId, false)
    try {
      const res = await fetch(`/api/products/${productId}/last-cost`)
      if (res.ok) {
        const data = await res.json()
        if (data?.unit_cost) {
          setDetailField(detailId, "unit_cost", String(data.unit_cost))
          toast.info(`Costo sugerido: $${Number(data.unit_cost).toLocaleString("es-AR")} (última compra)`)
        }
      }
    } catch { /* silencioso */ }
  }

  // ── Alta de Proveedor ──────────────────────────────────────────────────────
  const saveSupplier = async () => {
    if (!newSup.company_name.trim()) return
    setSavingSupplier(true)
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSup),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error desconocido")
      setSuppliers(p => [...p, data])
      setHeader("supplier_id", String(data.id))
      setNewSup({ company_name: "", cuit: "", phone: "" })
      setSupplierOpen(false)
      toast.success(`Proveedor "${data.company_name}" creado`)
    } catch (err: unknown) {
      toast.error(String((err as Error).message))
    } finally { setSavingSupplier(false) }
  }

  // ── Alta de Producto ───────────────────────────────────────────────────────
  const saveProduct = async () => {
    if (!newProd.name.trim()) return
    setSavingProduct(true)
    try {
      const res = await fetch("/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProd),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error desconocido")
      setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, "es")))
      if (targetDetailId) {
        setForm(f => ({
          ...f,
          details: f.details.map(d =>
            d.id === targetDetailId ? { ...d, product_id: String(data.id) } : d
          ),
        }))
      }
      setNewProd({ name: "", description: "", base_price: 0 })
      setProductOpen(false)
      setTargetDetailId(null)
      toast.success(`Producto "${data.name}" creado`)
    } catch (err: unknown) {
      toast.error(String((err as Error).message))
    } finally { setSavingProduct(false) }
  }

  // ── Líneas de detalle ──────────────────────────────────────────────────────
  const addDetail = () =>
    setForm(f => ({ ...f, details: [...f.details, emptyDetail()] }))
  const removeDetail = (id: string) =>
    setForm(f => ({ ...f, details: f.details.filter(d => d.id !== id) }))
  const setDetailField = (id: string, field: "product_id" | "unit_cost", value: string) =>
    setForm(f => ({
      ...f,
      details: f.details.map(d => d.id === id ? { ...d, [field]: value } : d),
    }))

  // ── Líneas Color / Curva ───────────────────────────────────────────────────
  const addColorLine = (detailId: string) =>
    setForm(f => ({
      ...f,
      details: f.details.map(d =>
        d.id === detailId
          ? { ...d, colorCurvaLines: [...d.colorCurvaLines, emptyLine()] }
          : d
      ),
    }))
  const removeColorLine = (detailId: string, lineId: string) =>
    setForm(f => ({
      ...f,
      details: f.details.map(d =>
        d.id === detailId
          ? { ...d, colorCurvaLines: d.colorCurvaLines.filter(l => l.id !== lineId) }
          : d
      ),
    }))
  const setLineField = (
    detailId: string, lineId: string,
    field: keyof Omit<ColorCurvaLine, "id">, value: string
  ) =>
    setForm(f => ({
      ...f,
      details: f.details.map(d =>
        d.id === detailId
          ? { ...d, colorCurvaLines: d.colorCurvaLines.map(l => l.id === lineId ? { ...l, [field]: value } : l) }
          : d
      ),
    }))

  // ── Guardar compra ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.supplier_id) {
      toast.warning("Seleccioná un proveedor"); return
    }
    const hasProduct = form.details.some(d => d.product_id)
    if (!hasProduct) {
      toast.warning("Agregá al menos un producto"); return
    }

    // Validar que ningún producto con costo 0
    const zeroCost = form.details.find(
      d => d.product_id && (parseFloat(d.unit_cost) || 0) === 0
    )
    if (zeroCost) {
      const prod = products.find(p => String(p.id) === zeroCost.product_id)
      toast.error(`El producto "${prod?.name ?? "sin nombre"}" tiene Precio Costo = $0. Completalo antes de grabar.`)
      return
    }

    setSaving(true)
    try {
      const payload = {
        supplier_id: form.supplier_id,
        invoice_number: form.invoice_number,
        purchase_date: form.purchase_date,
        title: form.title || null,
        details: form.details.map(d => ({
          product_id: d.product_id,
          unit_cost: parseFloat(d.unit_cost) || 0,
          lines: d.colorCurvaLines.map(l => ({
            color: l.color,
            curvas: parseInt(l.curvas) || 0,
            curva_sizes: l.curva_sizes,
          })),
        })),
      }
      const res = await fetch("/api/purchases", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error desconocido")
      toast.success(
        `Compra #${data.id} grabada — Total: $${(data.total_amount as number)
          .toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      )
      counter.current = 0
      setForm({
        supplier_id: "", invoice_number: "",
        purchase_date: new Date().toISOString().split("T")[0],
        title: "", details: [emptyDetail()],
      })
    } catch (err: unknown) {
      toast.error(`Error al guardar: ${(err as Error).message}`)
    } finally { setSaving(false) }
  }

  // ── Grupos de edades para el modal de stock ────────────────────────────────
  const stockEdadGroups = useMemo(() => {
    const map = new Map<string, StockRow[]>()
    for (const row of stockRows) {
      if (!map.has(row.edad)) map.set(row.edad, [])
      map.get(row.edad)!.push(row)
    }
    return map
  }, [stockRows])

  const stockTotal = useMemo(() =>
    stockRows.reduce((sum, row) =>
      sum + stockGenders.reduce((s, g) => s + (Number(row[g]) || 0), 0), 0),
    [stockRows, stockGenders]
  )

  const genderTotals = useMemo(() =>
    stockGenders.map(g =>
      stockRows.reduce((s, row) => s + (Number(row[g]) || 0), 0)
    ),
    [stockRows, stockGenders]
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Título + botón Stock */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Alta de Compra</h1>
              <p className="text-sm text-gray-500">Registro de mercadería ingresada de proveedor</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setStockOpen(true)}>
            <BarChart2 className="h-4 w-4 mr-2" />
            Stock por Categoría
          </Button>
        </div>

        {/* ── Encabezado ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 uppercase tracking-wide font-semibold">
              Datos del Comprobante
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Proveedor */}
              <div className="space-y-1.5">
                <Label>Proveedor</Label>
                <div className="flex gap-2">
                  <Select value={form.supplier_id} onValueChange={v => setHeader("supplier_id", v)}>
                    <SelectTrigger className="flex-1 w-full" disabled={loadingData}>
                      <SelectValue placeholder={loadingData ? "Cargando…" : "Seleccionar…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon"
                    title="Crear nuevo proveedor" onClick={() => setSupplierOpen(true)}>
                    <Plus />
                  </Button>
                </div>
              </div>

              {/* Título */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label>Título de la compra</Label>
                <Input placeholder="Ej: La Salada — Reposición, Camperas Importadas…"
                  value={form.title} onChange={e => setHeader("title", e.target.value)} />
              </div>

              {/* Nº Factura */}
              <div className="space-y-1.5">
                <Label>Nº Factura</Label>
                <Input placeholder="0001-00012345" value={form.invoice_number}
                  onChange={e => setHeader("invoice_number", e.target.value)} />
              </div>

              {/* Fecha */}
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={form.purchase_date}
                  onChange={e => setHeader("purchase_date", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Detalle ────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-800">Detalle de Mercadería</h2>

          {form.details.map((detail, idx) => {
            const detailQty      = detail.colorCurvaLines.reduce((s, l) => s + lineQty(l), 0)
            const detailSubtotal = (parseFloat(detail.unit_cost) || 0) * detailQty
            const selectedProd   = products.find(p => String(p.id) === detail.product_id)
            const hasCostError   = detail.product_id && (parseFloat(detail.unit_cost) || 0) === 0

            return (
              <Card key={detail.id} className="border-l-4 border-l-emerald-400">
                <CardContent className="pt-5 pb-4 space-y-4">

                  {/* Producto + Precio Costo */}
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="text-xs text-gray-400 font-bold self-end mb-2">{idx + 1}.</span>

                    {/* Producto — Combobox con búsqueda */}
                    <div className="flex-1 min-w-[220px] space-y-1.5">
                      <Label>Producto</Label>
                      <div className="flex gap-2">
                        <Popover
                          open={!!comboOpen[detail.id]}
                          onOpenChange={v => toggleCombo(detail.id, v)}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              disabled={loadingData}
                              className={cn(
                                "flex-1 justify-between font-normal text-left",
                                !detail.product_id && "text-muted-foreground"
                              )}
                            >
                              <span className="truncate">
                                {selectedProd
                                  ? <>
                                      {selectedProd.name}
                                      {selectedProd.base_price > 0 &&
                                        <span className="text-emerald-600 ml-1 font-medium">
                                          ${Number(selectedProd.base_price).toLocaleString("es-AR")}
                                        </span>
                                      }
                                    </>
                                  : loadingData ? "Cargando…" : "Seleccionar producto…"
                                }
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[360px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Buscar producto…"
                                value={productSearch}
                                onValueChange={setProductSearch}
                              />
                              <CommandList className="max-h-[400px]">
                                <CommandEmpty>No se encontró el producto.</CommandEmpty>
                                <CommandGroup>
                                  {!productSearch.trim() && products.length > 30 && (
                                    <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-100">
                                      Mostrando 30 de {products.length}. Escribí para buscar más.
                                    </div>
                                  )}
                                  {filteredProducts.map(p => (
                                    <CommandItem
                                      key={p.id}
                                      value={String(p.id)}
                                      onSelect={() => handleProductSelect(detail.id, String(p.id))}
                                    >
                                      <Check className={cn(
                                        "mr-2 h-4 w-4",
                                        detail.product_id === String(p.id) ? "opacity-100" : "opacity-0"
                                      )} />
                                      <span className="flex-1">{p.name}</span>
                                      {p.base_price > 0 && (
                                        <span className="text-xs text-emerald-600 font-semibold ml-2">
                                          ${Number(p.base_price).toLocaleString("es-AR")}
                                        </span>
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        <Button type="button" variant="outline" size="icon"
                          title="Crear nuevo producto"
                          onClick={() => { setTargetDetailId(detail.id); setProductOpen(true) }}>
                          <Plus />
                        </Button>
                      </div>
                    </div>

                    {/* Precio Costo */}
                    <div className="w-40 space-y-1.5">
                      <Label className={cn(hasCostError && "text-red-500")}>
                        Precio Costo {hasCostError && <span className="font-bold">⚠ requerido</span>}
                      </Label>
                      <Input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={detail.unit_cost}
                        className={cn(hasCostError && "border-red-400 focus-visible:ring-red-400")}
                        onChange={e => setDetailField(detail.id, "unit_cost", e.target.value)}
                      />
                    </div>

                    {/* Subtotal del producto */}
                    {detailSubtotal > 0 && (
                      <div className="self-end mb-2 text-sm text-gray-500">
                        ={" "}
                        <span className="font-semibold text-gray-800">
                          ${detailSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {/* Eliminar producto */}
                    {form.details.length > 1 && (
                      <Button type="button" variant="ghost" size="icon"
                        className="text-gray-300 hover:text-red-500 self-end"
                        onClick={() => removeDetail(detail.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* ── Filas Color / Curvas / Talles ─────────────────────── */}
                  <div className="ml-6 space-y-3">
                    <div className="hidden sm:grid sm:grid-cols-[1fr_70px_1.2fr_70px_36px] gap-2
                                    text-xs font-medium text-gray-400 px-1">
                      <span>Color</span>
                      <span>Curvas</span>
                      <span>Talles</span>
                      <span className="text-center">Prendas</span>
                      <span />
                    </div>

                    {detail.colorCurvaLines.map(line => {
                      const sizes   = parseTalles(line.curva_sizes)
                      const curvas  = parseInt(line.curvas) || 0
                      const prendas = curvas * sizes.length

                      return (
                        <div key={line.id} className="space-y-1">
                          <div className="grid grid-cols-2 sm:grid-cols-[1fr_70px_1.2fr_70px_36px] gap-2 items-start">
                            {/* Color */}
                            <div className="space-y-1 sm:space-y-0">
                              <span className="sm:hidden text-xs text-gray-400">Color</span>
                              <Input placeholder="Negro, Rojo…" value={line.color}
                                onChange={e => setLineField(detail.id, line.id, "color", e.target.value)} />
                            </div>
                            {/* Curvas */}
                            <div className="space-y-1 sm:space-y-0">
                              <span className="sm:hidden text-xs text-gray-400">Curvas</span>
                              <Input type="number" min="1" placeholder="1" value={line.curvas}
                                onChange={e => setLineField(detail.id, line.id, "curvas", e.target.value)} />
                            </div>
                            {/* Talles + preview */}
                            <div className="col-span-2 sm:col-span-1 space-y-1 sm:space-y-0">
                              <span className="sm:hidden text-xs text-gray-400">Talles</span>
                              <Input
                                placeholder="4-16  ó  0-5  ó  6-16,10,12"
                                value={line.curva_sizes}
                                onChange={e => setLineField(detail.id, line.id, "curva_sizes", e.target.value)}
                              />
                              {sizes.length > 0 && (
                                <p className="text-xs text-gray-400 mt-0.5 pl-0.5 leading-tight">
                                  {sizes.join(" · ")}{" "}
                                  <span className="text-gray-500 font-medium">
                                    ({sizes.length} {sizes.length === 1 ? "prenda" : "prendas"} por curva)
                                  </span>
                                </p>
                              )}
                            </div>
                            {/* Cantidad total */}
                            <div className="flex items-center justify-center sm:mt-0 mt-1">
                              {prendas > 0 ? (
                                <span className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded px-2 py-1 tabular-nums">
                                  {prendas}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-300">—</span>
                              )}
                            </div>
                            {/* Eliminar línea */}
                            <Button type="button" variant="ghost" size="icon"
                              className="text-gray-300 hover:text-red-400"
                              disabled={detail.colorCurvaLines.length === 1}
                              onClick={() => removeColorLine(detail.id, line.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Footer de la card */}
                    <div className="flex items-center justify-between pt-1">
                      <Button type="button" variant="ghost" size="sm"
                        className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 pl-0 h-8"
                        onClick={() => addColorLine(detail.id)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Agregar color
                      </Button>
                      {detailQty > 0 && (
                        <span className="text-xs text-gray-500">
                          Total producto:{" "}
                          <span className="font-semibold text-gray-700">{detailQty} prendas</span>
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          <Button type="button" variant="outline"
            className="w-full border-dashed text-gray-500 hover:text-gray-700"
            onClick={addDetail}>
            <Plus className="h-4 w-4 mr-2" /> Agregar Producto
          </Button>
        </div>

        {/* ── Total + Guardar ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Total estimado:{" "}
            <span className="text-xl font-bold text-gray-900" suppressHydrationWarning>
              ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <Button type="button" size="lg" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? "Guardando…" : "Guardar Compra"}
          </Button>
        </div>
      </div>

      {/* ══ Nuevo Proveedor ═══════════════════════════════════════════════════ */}
      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nuevo Proveedor</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nombre / Razón Social *</Label>
              <Input placeholder="Textiles SA" value={newSup.company_name} autoFocus
                onChange={e => setNewSup(p => ({ ...p, company_name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveSupplier()} />
            </div>
            <div className="space-y-1.5">
              <Label>CUIT</Label>
              <Input placeholder="30-12345678-9" value={newSup.cuit}
                onChange={e => setNewSup(p => ({ ...p, cuit: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="+54 11 1234-5678" value={newSup.phone}
                onChange={e => setNewSup(p => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierOpen(false)}>Cancelar</Button>
            <Button onClick={saveSupplier} disabled={!newSup.company_name.trim() || savingSupplier}>
              {savingSupplier && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Crear Proveedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Nuevo Producto ════════════════════════════════════════════════════ */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nuevo Producto</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input placeholder="Remera Básica" value={newProd.name} autoFocus
                onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveProduct()} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input placeholder="Algodón peinado 30/1…" value={newProd.description}
                onChange={e => setNewProd(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Precio Base</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00"
                value={newProd.base_price || ""}
                onChange={e => setNewProd(p => ({ ...p, base_price: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>Cancelar</Button>
            <Button onClick={saveProduct} disabled={!newProd.name.trim() || savingProduct}>
              {savingProduct && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Crear Producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Stock por Categoría ═══════════════════════════════════════════════ */}
      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-emerald-600" />
              Stock disponible por Categoría
            </DialogTitle>
          </DialogHeader>

          {/* Selector de categoría */}
          <div className="flex items-center gap-3 py-2">
            <Label className="whitespace-nowrap">Categoría</Label>
            <Select
              value={stockCatId}
              onValueChange={v => { setStockCatId(v); loadStockCategoria(v) }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Elegir categoría…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stockLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {/* Tabla pivote */}
          <div className="overflow-auto flex-1 rounded-md border">
            {!stockCatId ? (
              <p className="text-center text-sm text-gray-400 py-12">
                Seleccioná una categoría para ver el stock
              </p>
            ) : stockLoading ? (
              <p className="text-center text-sm text-gray-400 py-12">Cargando…</p>
            ) : stockRows.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">
                Sin stock disponible para esta categoría
              </p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-50">
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-r border-gray-200 w-24">
                      Edad
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700 border-b border-r border-gray-200 w-16">
                      Talle
                    </th>
                    {stockGenders.map(g => (
                      <th key={g} className="text-right px-3 py-2 font-semibold text-blue-800 border-b border-r border-gray-200 whitespace-nowrap">
                        {g}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(stockEdadGroups.entries()).map(([edad, rows], groupIdx) => (
                    rows.map((row, rowIdx) => {
                      const isFirstInGroup = rowIdx === 0
                      return (
                        <tr key={`${edad}-${row.talle}`}
                          className={groupIdx % 2 === 0 ? "bg-blue-50/40" : "bg-white"}>
                          {/* Edad — solo en la primera fila del grupo */}
                          <td className={cn(
                            "px-3 py-1.5 border-r border-gray-200 font-medium text-gray-700",
                            !isFirstInGroup && "text-transparent"
                          )}>
                            {isFirstInGroup ? edad : ""}
                          </td>
                          <td className="text-right px-3 py-1.5 border-r border-gray-200 tabular-nums font-medium">
                            {row.talle}
                          </td>
                          {stockGenders.map(g => {
                            const qty = Number(row[g]) || 0
                            const isLow = qty > 0 && qty < 3
                            return (
                              <td key={g} className={cn(
                                "text-right px-3 py-1.5 border-r border-gray-200 tabular-nums",
                                isLow ? "text-red-600 font-bold" : qty === 0 ? "text-gray-300" : "text-gray-800"
                              )}>
                                {qty === 0 ? "" : qty}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })
                  ))}
                </tbody>
                {/* Totales */}
                <tfoot>
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <td colSpan={2} className="px-3 py-2 text-gray-700 border-r border-gray-200">
                      Total general
                    </td>
                    {genderTotals.map((t, i) => (
                      <td key={i} className="text-right px-3 py-2 border-r border-gray-200 tabular-nums text-gray-800">
                        {t}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-gray-200 font-bold">
                    <td colSpan={2 + stockGenders.length} className="px-3 py-2 text-right text-gray-800 text-base">
                      Total {categories.find(c => String(c.id) === stockCatId)?.name ?? ""}: {stockTotal}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStockOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
