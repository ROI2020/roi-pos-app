"use client"

import { useState, useCallback, useRef } from "react"
import {
  Search, X, Camera, Loader2, ArrowRight, RefreshCw,
  Banknote, CreditCard, Smartphone, ArrowDownUp,
} from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CameraScanner } from "@/components/camera-scanner"

// ── Types ──────────────────────────────────────────────────────────────────────
interface PosSession { id: number }
interface AppUser    { id: number; name: string }

interface SoldVariant {
  id: number; sku: string; barcode: string; color: string; size: string
  product_name: string
  unit_price:     number   // precio en el carrito (pre-descuento de venta)
  effective_price: number  // precio real pagado (proporcional al descuento)
  subtotal:       number
  total_amount:   number
  discount_amount: number
  sale_detail_id: number; sale_id: number; sold_at: string
}

interface StockVariant {
  id: number; sku: string; barcode: string; color: string; size: string
  product_name: string; base_price: number
}

type PayMethod = 'efectivo' | 'debito' | 'credito' | 'mp' | 'transferencia'

const PAY_METHODS: { value: PayMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'efectivo',      label: 'Efectivo',      icon: <Banknote    className="h-3.5 w-3.5" /> },
  { value: 'debito',        label: 'Débito',        icon: <CreditCard  className="h-3.5 w-3.5" /> },
  { value: 'credito',       label: 'Crédito',       icon: <CreditCard  className="h-3.5 w-3.5" /> },
  { value: 'mp',            label: 'Mercado Pago',  icon: <Smartphone  className="h-3.5 w-3.5" /> },
  { value: 'transferencia', label: 'Transferencia', icon: <ArrowDownUp className="h-3.5 w-3.5" /> },
]

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

// ══════════════════════════════════════════════════════════════════════════════
// Panel: artículo devuelto (busca en sale_details)
// ══════════════════════════════════════════════════════════════════════════════
function ReturnedItemPanel({
  branchId, selected, onSelect,
}: {
  branchId:  number
  selected:  SoldVariant | null
  onSelect:  (v: SoldVariant | null) => void
}) {
  const [query,      setQuery     ] = useState('')
  const [results,    setResults   ] = useState<SoldVariant[]>([])
  const [loading,    setLoading   ] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res  = await fetch(
        `/api/pos/sold-lookup?q=${encodeURIComponent(q)}&branch_id=${branchId}`
      )
      const data = await res.json()
      if (data.mode === 'exact' && data.results.length === 1) {
        onSelect(data.results[0])
        setQuery(''); setResults([])
        return
      }
      setResults(data.results ?? [])
    } catch { toast.error('Error al buscar el artículo') }
    finally  { setLoading(false) }
  }, [branchId, onSelect])

  // ── Artículo ya seleccionado ──────────────────────────────────────────────
  if (selected) {
    const hadDiscount = selected.discount_amount > 0
    return (
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{selected.product_name}</p>
            <p className="text-xs text-gray-500">{selected.color} · T.{selected.size}</p>
            <p className="text-[11px] font-mono text-gray-400 mt-0.5">{selected.barcode}</p>
          </div>
          <button
            className="text-gray-400 hover:text-red-600 shrink-0 mt-0.5"
            onClick={() => onSelect(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="pt-1 border-t border-red-200">
          <p className="text-lg font-bold text-red-600">{fmt(selected.effective_price)}</p>
          {hadDiscount ? (
            <p className="text-[11px] text-gray-500">
              Precio pagado con descuento
              <span className="ml-1 line-through text-gray-400">{fmt(selected.unit_price)}</span>
              {' '}→ {fmt(selected.effective_price)}
            </p>
          ) : (
            <p className="text-[11px] text-gray-400">Precio que pagó el cliente</p>
          )}
        </div>
      </div>
    )
  }

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            ref={inputRef}
            autoFocus
            className="pl-9 h-10 text-sm"
            placeholder="Código o nombre…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch(query)}
          />
        </div>
        <Button
          variant="outline" size="icon" className="h-10 w-10 shrink-0"
          title="Escanear código de barras"
          onClick={() => setCameraOpen(true)}
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>

      <Button
        variant="outline" size="sm" className="w-full gap-1.5 text-xs h-8"
        onClick={() => doSearch(query)} disabled={loading || !query.trim()}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Search  className="h-3.5 w-3.5" />
        }
        Buscar en ventas
      </Button>

      {results.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden divide-y divide-gray-50 max-h-44 overflow-y-auto">
          {results.map(v => (
            <button
              key={v.sale_detail_id}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
              onClick={() => { onSelect(v); setResults([]); setQuery('') }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{v.product_name}</p>
                <p className="text-xs text-gray-500">{v.color} · T.{v.size}</p>
              </div>
              <span className="text-sm font-semibold text-red-600 shrink-0">
                {fmt(v.unit_price)}
              </span>
            </button>
          ))}
        </div>
      )}

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={v => { setCameraOpen(false); doSearch(v) }}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Panel: artículo nuevo (busca en branch_inventory)
// ══════════════════════════════════════════════════════════════════════════════
function NewItemPanel({
  branchId, selected, onSelect,
}: {
  branchId:  number
  selected:  StockVariant | null
  onSelect:  (v: StockVariant | null) => void
}) {
  const [query,      setQuery     ] = useState('')
  const [results,    setResults   ] = useState<StockVariant[]>([])
  const [loading,    setLoading   ] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res  = await fetch(
        `/api/pos/lookup?q=${encodeURIComponent(q)}&branch_id=${branchId}`
      )
      const data = await res.json()
      if (data.mode === 'exact' && data.results.length === 1) {
        onSelect(data.results[0])
        setQuery(''); setResults([])
        return
      }
      setResults(data.results ?? [])
    } catch { toast.error('Error al buscar el artículo') }
    finally  { setLoading(false) }
  }, [branchId, onSelect])

  // ── Artículo ya seleccionado ──────────────────────────────────────────────
  if (selected) {
    return (
      <div className="rounded-xl border-2 border-green-200 bg-green-50 p-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{selected.product_name}</p>
            <p className="text-xs text-gray-500">{selected.color} · T.{selected.size}</p>
            <p className="text-[11px] font-mono text-gray-400 mt-0.5">{selected.barcode}</p>
          </div>
          <button
            className="text-gray-400 hover:text-red-600 shrink-0 mt-0.5"
            onClick={() => onSelect(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="pt-1 border-t border-green-200">
          <p className="text-lg font-bold text-green-700">{fmt(selected.base_price)}</p>
          <p className="text-[11px] text-gray-400">Precio de lista</p>
        </div>
      </div>
    )
  }

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9 h-10 text-sm"
            placeholder="Código o nombre…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch(query)}
          />
        </div>
        <Button
          variant="outline" size="icon" className="h-10 w-10 shrink-0"
          title="Escanear código de barras"
          onClick={() => setCameraOpen(true)}
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>

      <Button
        variant="outline" size="sm" className="w-full gap-1.5 text-xs h-8"
        onClick={() => doSearch(query)} disabled={loading || !query.trim()}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Search  className="h-3.5 w-3.5" />
        }
        Buscar en stock
      </Button>

      {results.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden divide-y divide-gray-50 max-h-44 overflow-y-auto">
          {results.map(v => (
            <button
              key={v.id}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
              onClick={() => { onSelect(v); setResults([]); setQuery('') }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{v.product_name}</p>
                <p className="text-xs text-gray-500">{v.color} · T.{v.size}</p>
              </div>
              <span className="text-sm font-semibold text-green-700 shrink-0">
                {fmt(v.base_price)}
              </span>
            </button>
          ))}
        </div>
      )}

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={v => { setCameraOpen(false); doSearch(v) }}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Diálogo principal de cambio
// ══════════════════════════════════════════════════════════════════════════════
export function ExchangeDialog({
  session,
  branchId,
  users,
  currentUserId,
  onClose,
  onSaved,
}: {
  session:       PosSession
  branchId:      number
  users:         AppUser[]
  currentUserId: number | null
  onClose:       () => void
  onSaved:       () => void
}) {
  const [returnedItem, setReturnedItem] = useState<SoldVariant  | null>(null)
  const [newItem,      setNewItem      ] = useState<StockVariant | null>(null)
  const [newPrice,     setNewPrice     ] = useState('')
  const [payMethod,    setPayMethod    ] = useState<PayMethod>('efectivo')
  const [userId,       setUserId       ] = useState(currentUserId ? String(currentUserId) : '__none__')
  const [notes,        setNotes        ] = useState('')
  const [saving,       setSaving       ] = useState(false)

  const handleNewItemSelect = (item: StockVariant | null) => {
    setNewItem(item)
    setNewPrice(item ? String(item.base_price) : '')
  }

  // Usamos effective_price: lo que el cliente realmente pagó (ya incluye descuento proporcional)
  const returnedPrice = returnedItem ? Number(returnedItem.effective_price) : 0
  const newPriceNum   = parseFloat(newPrice) || 0
  const difference    = newPriceNum - returnedPrice
  const hasDiff       = Math.abs(difference) > 0.005

  const handleConfirm = async () => {
    if (!returnedItem) { toast.error('Seleccioná el artículo a devolver');   return }
    if (!newItem)      { toast.error('Seleccioná el artículo de reemplazo'); return }
    if (isNaN(newPriceNum) || newPriceNum < 0)
      { toast.error('Precio del artículo nuevo inválido'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/exchanges', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id:           branchId,
          pos_session_id:      session.id,
          user_id:             userId !== '__none__' ? parseInt(userId) : null,
          returned_variant_id: returnedItem.id,
          new_variant_id:      newItem.id,
          new_price:           newPriceNum,
          payment_method:      hasDiff ? payMethod : null,
          notes:               notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Cambio registrado correctamente')
      onSaved()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-violet-600" />
            Cambio de mercadería
          </DialogTitle>
        </DialogHeader>

        {/* ── Dos columnas: devuelto | nuevo ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              1 · Artículo devuelto
            </p>
            <ReturnedItemPanel
              branchId={branchId}
              selected={returnedItem}
              onSelect={setReturnedItem}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              2 · Artículo de reemplazo
            </p>
            <NewItemPanel
              branchId={branchId}
              selected={newItem}
              onSelect={handleNewItemSelect}
            />
          </div>
        </div>

        {/* ── Resumen de diferencia (solo cuando ambos están seleccionados) ── */}
        {returnedItem && newItem && (
          <div className="rounded-xl border bg-gray-50 p-4 space-y-4">

            {/* Línea visual devuelto → nuevo → diferencia */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
                {returnedItem.product_name} T.{returnedItem.size}
                {' · '}{fmt(returnedPrice)}
                {returnedItem.discount_amount > 0 && (
                  <span className="ml-1 text-xs font-normal opacity-60 line-through">
                    {fmt(returnedItem.unit_price)}
                  </span>
                )}
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1">
                {newItem.product_name} T.{newItem.size} · {fmt(newPriceNum)}
              </span>
              <span className={`ml-auto font-bold text-base shrink-0 ${
                difference > 0 ? 'text-emerald-700' :
                difference < 0 ? 'text-green-700' : 'text-gray-500'
              }`}>
                {difference > 0
                  ? `Cliente paga ${fmt(difference)}`
                  : difference < 0
                  ? `Devolver ${fmt(Math.abs(difference))}`
                  : 'Sin diferencia'
                }
              </span>
            </div>

            {/* Precio editable del artículo nuevo */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-gray-500 shrink-0 w-44">
                Precio del artículo nuevo ($)
              </Label>
              <Input
                type="number" min={0} step="0.01"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                className="h-8 text-sm w-36"
              />
            </div>

            {/* Forma de pago — solo si hay diferencia */}
            {hasDiff && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {difference > 0 ? 'El cliente paga con' : 'Devolución mediante'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PAY_METHODS.map(pm => (
                    <button
                      key={pm.value}
                      onClick={() => setPayMethod(pm.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                        ${payMethod === pm.value
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-700'
                        }`}
                    >
                      {pm.icon}
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Usuario + Notas ── */}
        {returnedItem && newItem && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Atendido por</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Usuario…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="italic text-gray-400">Sin especificar</span>
                  </SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Notas</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Motivo del cambio…"
                className="h-9 text-sm"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || !returnedItem || !newItem}
            className="gap-2"
          >
            {saving
              ? <Loader2   className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />
            }
            Confirmar cambio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
