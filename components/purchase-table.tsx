"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Plus, Trash2, ShoppingBag, Loader2 } from "lucide-react"
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
import { parseTalles } from "@/lib/talles"

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
  base_price: string
}

interface ColorCurvaLine {
  id: string
  color: string
  curvas: string      // cantidad de curvas (packs) pedidas
  curva_sizes: string // rango de talles, ej: "4-16,10,12"
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

// ── Componente ─────────────────────────────────────────────────────────────────
export default function PurchaseTable() {
  // Generador de IDs estable (useRef garantiza igual valor en server y client)
  const counter = useRef(0)
  const uid = () => `id-${++counter.current}`

  const emptyLine = (): ColorCurvaLine => ({
    id: uid(), color: "", curvas: "", curva_sizes: "",
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

  // Setear fecha local en el cliente (evita diferencia UTC vs. Argentina)
  useEffect(() => {
    setForm(f => ({
      ...f,
      purchase_date: new Date().toISOString().split("T")[0],
    }))
  }, [])

  // ── Datos de la base de datos ──────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [supRes, prodRes] = await Promise.all([
          fetch("/api/suppliers"),
          fetch("/api/products"),
        ])
        if (supRes.ok)  setSuppliers(await supRes.json())
        if (prodRes.ok) setProducts(await prodRes.json())
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
  const [productOpen, setProductOpen] = useState(false)
  const [targetDetailId, setTargetDetailId] = useState<string | null>(null)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [savingProduct, setSavingProduct] = useState(false)
  const [saving, setSaving] = useState(false)

  const [newSup, setNewSup] = useState<Omit<Supplier, "id">>({
    company_name: "", cuit: "", phone: "",
  })
  const [newProd, setNewProd] = useState<Omit<Product, "id">>({
    name: "", description: "", base_price: "",
  })

  // ── Helpers de cantidad ────────────────────────────────────────────────────
  const lineQty = (line: ColorCurvaLine) => {
    const curvas = parseInt(line.curvas) || 0
    return curvas * parseTalles(line.curva_sizes).length
  }

  // ── Total general ──────────────────────────────────────────────────────────
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

  // ── Alta de Proveedor ──────────────────────────────────────────────────────
  const saveSupplier = async () => {
    if (!newSup.company_name.trim()) return
    setSavingSupplier(true)
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } finally {
      setSavingSupplier(false)
    }
  }

  // ── Alta de Producto ───────────────────────────────────────────────────────
  const saveProduct = async () => {
    if (!newProd.name.trim()) return
    setSavingProduct(true)
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProd),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error desconocido")
      setProducts(prev => [...prev, data])
      if (targetDetailId) {
        setForm(f => ({
          ...f,
          details: f.details.map(d =>
            d.id === targetDetailId ? { ...d, product_id: String(data.id) } : d
          ),
        }))
      }
      setNewProd({ name: "", description: "", base_price: "" })
      setProductOpen(false)
      setTargetDetailId(null)
      toast.success(`Producto "${data.name}" creado`)
    } catch (err: unknown) {
      toast.error(String((err as Error).message))
    } finally {
      setSavingProduct(false)
    }
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
    detailId: string,
    lineId: string,
    field: keyof Omit<ColorCurvaLine, "id">,
    value: string
  ) =>
    setForm(f => ({
      ...f,
      details: f.details.map(d =>
        d.id === detailId
          ? {
              ...d,
              colorCurvaLines: d.colorCurvaLines.map(l =>
                l.id === lineId ? { ...l, [field]: value } : l
              ),
            }
          : d
      ),
    }))

  // ── Guardar compra en la BD ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.supplier_id) {
      toast.warning("Seleccioná un proveedor")
      return
    }
    const hasProduct = form.details.some(d => d.product_id)
    if (!hasProduct) {
      toast.warning("Agregá al menos un producto")
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error desconocido")

      toast.success(
        `Compra #${data.id} grabada — Total: $${(data.total_amount as number)
          .toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      )

      // Resetear el formulario
      counter.current = 0
      setForm({
        supplier_id: "",
        invoice_number: "",
        purchase_date: new Date().toISOString().split("T")[0],
        title: "",
        details: [emptyDetail()],
      })
    } catch (err: unknown) {
      toast.error(`Error al guardar: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Título */}
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Alta de Compra</h1>
            <p className="text-sm text-gray-500">Registro de mercadería ingresada de proveedor</p>
          </div>
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
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon"
                    title="Crear nuevo proveedor" onClick={() => setSupplierOpen(true)}>
                    <Plus />
                  </Button>
                </div>
              </div>

              {/* Título / descripción de la compra */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label>Título de la compra</Label>
                <Input
                  placeholder="Ej: La Salada — Reposición, Camperas Importadas, Liquidación Proveedor X…"
                  value={form.title}
                  onChange={e => setHeader("title", e.target.value)}
                />
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
            const detailQty = detail.colorCurvaLines.reduce((s, l) => s + lineQty(l), 0)
            const detailSubtotal = (parseFloat(detail.unit_cost) || 0) * detailQty

            return (
              <Card key={detail.id} className="border-l-4 border-l-emerald-400">
                <CardContent className="pt-5 pb-4 space-y-4">

                  {/* Producto + Precio Costo */}
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="text-xs text-gray-400 font-bold self-end mb-2">
                      {idx + 1}.
                    </span>

                    {/* Producto */}
                    <div className="flex-1 min-w-[200px] space-y-1.5">
                      <Label>Producto</Label>
                      <div className="flex gap-2">
                        <Select value={detail.product_id}
                          onValueChange={v => setDetailField(detail.id, "product_id", v)}>
                          <SelectTrigger className="flex-1 w-full" disabled={loadingData}>
                            <SelectValue placeholder={loadingData ? "Cargando…" : "Seleccionar…"} />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                <span>{p.name}</span>
                                {p.description && (
                                  <span className="text-gray-400 text-xs ml-1">
                                    — {p.description}
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="icon"
                          title="Crear nuevo producto"
                          onClick={() => { setTargetDetailId(detail.id); setProductOpen(true) }}>
                          <Plus />
                        </Button>
                      </div>
                    </div>

                    {/* Precio Costo */}
                    <div className="w-36 space-y-1.5">
                      <Label>Precio Costo</Label>
                      <Input type="number" min="0" step="0.01" placeholder="0.00"
                        value={detail.unit_cost}
                        onChange={e => setDetailField(detail.id, "unit_cost", e.target.value)} />
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

                    {/* Encabezados (desktop) */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_70px_1.2fr_70px_36px] gap-2
                                    text-xs font-medium text-gray-400 px-1">
                      <span>Color</span>
                      <span>Curvas</span>
                      <span>Talles</span>
                      <span className="text-center">Prendas</span>
                      <span />
                    </div>

                    {detail.colorCurvaLines.map(line => {
                      const sizes = parseTalles(line.curva_sizes)
                      const curvas = parseInt(line.curvas) || 0
                      const prendas = curvas * sizes.length

                      return (
                        <div key={line.id} className="space-y-1">
                          <div className="grid grid-cols-2 sm:grid-cols-[1fr_70px_1.2fr_70px_36px]
                                          gap-2 items-start">
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
                                onChange={e =>
                                  setLineField(detail.id, line.id, "curva_sizes", e.target.value)
                                }
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

                            {/* Cantidad total (derivada) */}
                            <div className="flex items-center justify-center sm:mt-0 mt-1">
                              {prendas > 0 ? (
                                <span className="text-sm font-bold text-emerald-700 bg-emerald-50
                                                 rounded px-2 py-1 tabular-nums">
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
            <Button onClick={saveSupplier}
              disabled={!newSup.company_name.trim() || savingSupplier}>
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
                value={newProd.base_price}
                onChange={e => setNewProd(p => ({ ...p, base_price: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>Cancelar</Button>
            <Button onClick={saveProduct}
              disabled={!newProd.name.trim() || savingProduct}>
              {savingProduct && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Crear Producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
