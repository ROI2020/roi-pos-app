"use client"

import {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react"
import {
  ShoppingCart, Search, Trash2, Loader2, CheckCircle2,
  AlertTriangle, X, CreditCard, Banknote, Smartphone,
  ArrowDownUp, Lock, Unlock, ChevronDown, Camera, Plus,
  Receipt, RefreshCw, ReceiptText,
} from "lucide-react"
import { CameraScanner }   from "@/components/camera-scanner"
import { ExchangeDialog }  from "@/components/exchange-dialog"
import { ReceiptDialog, type ReceiptData, type ReceiptSettings } from "@/components/receipt-dialog"
import { TodaySalesDialog } from "@/components/today-sales-dialog"
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
interface Branch    { id: number; name: string; is_default: boolean }
interface AppUser   { id: number; name: string; role: string }
interface ExpenseType { id: number; name: string }
interface PosSession {
  id: number; branch_id: number; opened_at: string; closed_at: string | null
  opening_balance: number; closing_balance: number | null
  opened_by_user_id: number | null
  // nombres resueltos
  branch_name:           string | null
  opened_by_user_name:   string | null
  closed_by_user_name:   string | null
  // ventas
  sales_count: number; sales_total: number
  cash_total: number; debit_total: number
  credit_total: number; mp_total: number; transfer_total: number
  // gastos
  expense_count: number; expense_total: number
  expense_cash_total: number; expense_debit_total: number
  expense_credit_total: number; expense_mp_total: number; expense_transfer_total: number
}

interface BusinessSettings {
  business_name:           string | null
  whatsapp_report_number:  string | null
  business_logo:           string | null
  receipt_phone:           string | null
  receipt_address:         string | null
  receipt_footer:          string | null
  receipt_no_invoice_text: string | null
}
interface Variant {
  id: number; sku: string; barcode: string; color: string; size: string
  product_id: number; product_name: string; base_price: number
  category_name: string | null; branch_name: string | null
}
interface CartItem extends Variant { unit_price: number }

type PayMethod = 'efectivo' | 'debito' | 'credito' | 'mp' | 'transferencia'

// ── Formateo ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Formas de pago ─────────────────────────────────────────────────────────────
const PAY_METHODS: { value: PayMethod; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'efectivo',      label: 'Efectivo',      icon: <Banknote    className="h-4 w-4" />, color: 'border-green-400  text-green-700  bg-green-50'  },
  { value: 'debito',        label: 'Débito',        icon: <CreditCard  className="h-4 w-4" />, color: 'border-emerald-400   text-emerald-700   bg-emerald-50'   },
  { value: 'credito',       label: 'Crédito',       icon: <CreditCard  className="h-4 w-4" />, color: 'border-violet-400 text-violet-700 bg-violet-50' },
  { value: 'mp',            label: 'Mercado Pago',  icon: <Smartphone  className="h-4 w-4" />, color: 'border-sky-400    text-sky-700    bg-sky-50'    },
  { value: 'transferencia', label: 'Transferencia', icon: <ArrowDownUp className="h-4 w-4" />, color: 'border-amber-400  text-amber-700  bg-amber-50'  },
]

// ── Diálogo: abrir caja ────────────────────────────────────────────────────────
function OpenSessionDialog({
  branch,
  onConfirm,
  onClose,
}: {
  branch: Branch
  onConfirm: (balance: number) => Promise<void>
  onClose: () => void
}) {
  const [balance, setBalance] = useState('')
  const [saving,  setSaving ] = useState(false)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-green-600" />
            Abrir Caja — {branch.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>Saldo inicial en caja ($)</Label>
          <Input
            autoFocus type="number" min={0} placeholder="0"
            value={balance} onChange={e => setBalance(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !saving && onConfirm(parseFloat(balance) || 0).then(() => setSaving(false))}
          />
          <p className="text-xs text-gray-400">
            Contá el efectivo disponible antes de empezar.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={async () => {
              setSaving(true)
              await onConfirm(parseFloat(balance) || 0)
              setSaving(false)
            }}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Abrir caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Builder del mensaje de WhatsApp ───────────────────────────────────────────
function buildWhatsAppText(
  session:         PosSession,
  businessName:    string,
  closingUserName: string | null,
  closingTime:     Date,
  closing:         string,
  expectedCash:    number,
): string {
  const fmtArs = (n: number) =>
    '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  // 24 h manual: evita los "a. m."/"p. m." del locale es-AR
  const fmtHour = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const openedAt   = new Date(session.opened_at)
  const counted    = parseFloat(closing) || 0
  const hasCounted = closing.trim() !== ''
  const diff       = counted - expectedCash

  const lines: string[] = [
    `*${businessName} - CIERRE DE CAJA*`,
    session.branch_name ? `Sucursal: ${session.branch_name}` : '',
    `Fecha: ${fmtDate(closingTime)}`,
    '',
    `*APERTURA*`,
    `Hora: ${fmtHour(openedAt)}`,
    session.opened_by_user_name ? `Usuario: ${session.opened_by_user_name}` : '',
    `Saldo inicial: ${fmtArs(Number(session.opening_balance))}`,
    '',
    `*CIERRE*`,
    `Hora: ${fmtHour(closingTime)}`,
    closingUserName ? `Usuario: ${closingUserName}` : '',
    '',
    `━━━━━━━━━━━━━━━`,
    `*VENTAS DEL TURNO*`,
    `━━━━━━━━━━━━━━━`,
    `Cantidad: ${session.sales_count} venta${session.sales_count !== 1 ? 's' : ''}`,
    `Total: ${fmtArs(session.sales_total)}`,
    session.cash_total     > 0 ? `Efectivo: ${fmtArs(session.cash_total)}`         : '',
    session.debit_total    > 0 ? `Debito: ${fmtArs(session.debit_total)}`          : '',
    session.credit_total   > 0 ? `Credito: ${fmtArs(session.credit_total)}`        : '',
    session.mp_total       > 0 ? `Mercado Pago: ${fmtArs(session.mp_total)}`       : '',
    session.transfer_total > 0 ? `Transferencia: ${fmtArs(session.transfer_total)}` : '',
    ...(session.expense_count > 0 ? [
      '',
      `━━━━━━━━━━━━━━━`,
      `*GASTOS DEL TURNO*`,
      `━━━━━━━━━━━━━━━`,
      `Total: ${fmtArs(session.expense_total)} (${session.expense_count} gasto${session.expense_count !== 1 ? 's' : ''})`,
      session.expense_cash_total     > 0 ? `Efectivo: ${fmtArs(session.expense_cash_total)}`         : '',
      session.expense_debit_total    > 0 ? `Debito: ${fmtArs(session.expense_debit_total)}`          : '',
      session.expense_credit_total   > 0 ? `Credito: ${fmtArs(session.expense_credit_total)}`        : '',
      session.expense_mp_total       > 0 ? `Mercado Pago: ${fmtArs(session.expense_mp_total)}`       : '',
      session.expense_transfer_total > 0 ? `Transferencia: ${fmtArs(session.expense_transfer_total)}` : '',
    ] : []),
    '',
    `━━━━━━━━━━━━━━━`,
    `*EFECTIVO EN CAJA*`,
    `━━━━━━━━━━━━━━━`,
    `Saldo inicial: ${fmtArs(Number(session.opening_balance))}`,
    `+ Ventas efectivo: ${fmtArs(session.cash_total)}`,
    session.expense_cash_total > 0 ? `- Gastos efectivo: ${fmtArs(session.expense_cash_total)}` : '',
    `= Esperado: ${fmtArs(expectedCash)}`,
    hasCounted ? `Contado: ${fmtArs(counted)}` : '',
    hasCounted ? `Diferencia: ${diff >= 0 ? '+' : ''}${fmtArs(diff)}` : '',
    '',
    `_Enviado desde ROI POS_`,
  ]

  return lines.filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

// ── Diálogo: cerrar caja ───────────────────────────────────────────────────────
function CloseSessionDialog({
  session,
  businessSettings,
  closingUserName,
  onConfirm,
  onClose,
}: {
  session:          PosSession
  businessSettings: BusinessSettings
  closingUserName:  string | null
  onConfirm: (closing: number, notes: string) => Promise<void>
  onClose: () => void
}) {
  const [closing,    setClosing  ] = useState('')
  const [notes,      setNotes    ] = useState('')
  const [saving,     setSaving   ] = useState(false)
  // capturamos la hora al abrir el diálogo
  const [closingTime] = useState(() => new Date())

  const expectedCash =
    Number(session.opening_balance) +
    Number(session.cash_total) -
    Number(session.expense_cash_total)
  const difference   = (parseFloat(closing) || 0) - expectedCash
  const hasExpenses  = session.expense_count > 0

  const businessName = businessSettings.business_name ?? 'ROI POS'
  const waNumber     = businessSettings.whatsapp_report_number

  const handleWhatsApp = () => {
    const text = buildWhatsAppText(
      session, businessName, closingUserName, closingTime, closing, expectedCash
    )
    const number = waNumber!.replace(/\D/g, '')
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const fmtHour = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-500" />
            Cerrar Caja
          </DialogTitle>
        </DialogHeader>

        {/* ── Encabezado: negocio / sucursal / fecha ── */}
        <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 space-y-0.5">
          <p className="font-bold text-gray-900 text-base">{businessName}</p>
          {session.branch_name && (
            <p className="text-sm text-gray-600">📍 {session.branch_name}</p>
          )}
          <p className="text-xs text-gray-400 capitalize">{fmtDate(closingTime)}</p>
        </div>

        {/* ── Apertura / Cierre lado a lado ── */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Apertura</p>
            <p className="font-medium text-gray-800">{fmtHour(session.opened_at)} hs</p>
            {session.opened_by_user_name && (
              <p className="text-xs text-gray-500">👤 {session.opened_by_user_name}</p>
            )}
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Cierre</p>
            <p className="font-medium text-gray-800">
              {String(closingTime.getHours()).padStart(2, '0')}:{String(closingTime.getMinutes()).padStart(2, '0')}
            </p>
            {closingUserName && (
              <p className="text-xs text-gray-500">👤 {closingUserName}</p>
            )}
          </div>
        </div>

        {/* ── Ventas del turno ── */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
          <p className="font-semibold text-gray-700 mb-1.5">Ventas del turno</p>
          <Row label="Cantidad" value={`${session.sales_count} venta${session.sales_count !== 1 ? 's' : ''}`} />
          <Row label="Total vendido" value={fmt(session.sales_total)} />
          {(session.cash_total > 0 || session.debit_total > 0 || session.credit_total > 0 ||
            session.mp_total > 0 || session.transfer_total > 0) && (
            <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
              {session.cash_total     > 0 && <Row label="↳ Efectivo"      value={fmt(session.cash_total)}     small />}
              {session.debit_total    > 0 && <Row label="↳ Débito"        value={fmt(session.debit_total)}    small />}
              {session.credit_total   > 0 && <Row label="↳ Crédito"       value={fmt(session.credit_total)}   small />}
              {session.mp_total       > 0 && <Row label="↳ Mercado Pago"  value={fmt(session.mp_total)}       small />}
              {session.transfer_total > 0 && <Row label="↳ Transferencia" value={fmt(session.transfer_total)} small />}
            </div>
          )}
        </div>

        {/* ── Gastos del turno ── */}
        {hasExpenses && (
          <div className="bg-amber-50 rounded-xl p-3 space-y-1.5 text-sm border border-amber-100">
            <p className="font-semibold text-amber-800 mb-1.5">
              Gastos del turno
              <span className="ml-1.5 text-xs font-normal text-amber-600">
                ({session.expense_count} gasto{session.expense_count !== 1 ? 's' : ''})
              </span>
            </p>
            <Row label="Total gastos" value={fmt(session.expense_total)} />
            <div className="border-t border-amber-200 pt-1.5 mt-1 space-y-1">
              {session.expense_cash_total     > 0 && <Row label="↳ Efectivo"      value={fmt(session.expense_cash_total)}     small />}
              {session.expense_debit_total    > 0 && <Row label="↳ Débito"        value={fmt(session.expense_debit_total)}    small />}
              {session.expense_credit_total   > 0 && <Row label="↳ Crédito"       value={fmt(session.expense_credit_total)}   small />}
              {session.expense_mp_total       > 0 && <Row label="↳ Mercado Pago"  value={fmt(session.expense_mp_total)}       small />}
              {session.expense_transfer_total > 0 && <Row label="↳ Transferencia" value={fmt(session.expense_transfer_total)} small />}
            </div>
          </div>
        )}

        {/* ── Efectivo en caja ── */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
          <p className="font-semibold text-gray-700 mb-1.5">Efectivo en caja</p>
          <Row label="Saldo inicial"      value={fmt(Number(session.opening_balance))} small />
          <Row label="+ Ventas efectivo"  value={fmt(session.cash_total)}              small />
          {session.expense_cash_total > 0 &&
            <Row label="− Gastos efectivo" value={fmt(session.expense_cash_total)}     small />
          }
          <div className="border-t border-gray-200 pt-1.5 mt-0.5">
            <Row label="Efectivo esperado" value={fmt(expectedCash)} />
          </div>
        </div>

        {/* ── Conteo + Notas ── */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Efectivo contado en caja ($)</Label>
            <Input
              autoFocus type="number" min={0} placeholder="0"
              value={closing} onChange={e => setClosing(e.target.value)}
            />
            {closing !== '' && (
              <p className={`text-xs font-medium ${difference >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                Diferencia: {difference >= 0 ? '+' : ''}{fmt(difference)}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Input placeholder="Observaciones del turno…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose} className="mr-auto">Cancelar</Button>

          {/* WhatsApp — solo si hay número configurado */}
          {waNumber && (
            <Button
              variant="outline"
              onClick={handleWhatsApp}
              className="gap-2 border-green-400 text-green-700 hover:bg-green-50"
            >
              {/* WhatsApp icon SVG inline */}
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar por WhatsApp
            </Button>
          )}

          <Button
            variant="destructive"
            onClick={async () => { setSaving(true); await onConfirm(parseFloat(closing) || 0, notes); setSaving(false) }}
            disabled={saving}
            className="gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cerrar caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, unit = '', small }: { label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <div className={`flex justify-between ${small ? 'text-xs text-gray-500' : 'text-sm text-gray-700'}`}>
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value}{unit}</span>
    </div>
  )
}

// ── Diálogo: registrar gasto ───────────────────────────────────────────────────
function ExpenseDialog({
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
  const [expenseTypes,   setExpenseTypes  ] = useState<ExpenseType[]>([])
  const [expenseTypeId,  setExpenseTypeId ] = useState('')
  const [showAddType,    setShowAddType   ] = useState(false)
  const [newTypeName,    setNewTypeName   ] = useState('')
  const [description,    setDescription  ] = useState('')
  const [amount,         setAmount       ] = useState('')
  const [payMethod,      setPayMethod    ] = useState<PayMethod>('efectivo')
  const [userId,         setUserId       ] = useState(currentUserId ? String(currentUserId) : '')
  const [saving,         setSaving       ] = useState(false)
  const [addingType,     setAddingType   ] = useState(false)

  useEffect(() => {
    fetch('/api/expense-types')
      .then(r => r.json())
      .then((data: ExpenseType[]) => setExpenseTypes(data))
      .catch(() => toast.error('Error al cargar tipos de gasto'))
  }, [])

  const handleAddType = async () => {
    if (!newTypeName.trim()) return
    setAddingType(true)
    try {
      const res  = await fetch('/api/expense-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTypeName.trim() }),
      })
      const data: ExpenseType = await res.json()
      if (!res.ok) throw new Error((data as unknown as { error: string }).error)
      setExpenseTypes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setExpenseTypeId(String(data.id))
      setNewTypeName('')
      setShowAddType(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setAddingType(false)
    }
  }

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast.error('Ingresá un monto válido'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pos_session_id:  session.id,
          branch_id:       branchId,
          user_id:         userId ? parseInt(userId) : null,
          expense_type_id: expenseTypeId ? parseInt(expenseTypeId) : null,
          description:     description.trim() || null,
          amount:          amt,
          payment_method:  payMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Gasto de ${fmt(amt)} registrado`)
      onSaved()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">💸</span>
            Registrar Gasto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Tipo de gasto */}
          <div className="space-y-1.5">
            <Label>Tipo de gasto</Label>
            <div className="flex gap-2">
              <Select value={expenseTypeId} onValueChange={setExpenseTypeId}>
                <SelectTrigger className="text-sm flex-1">
                  <SelectValue placeholder="Seleccioná un tipo…" />
                </SelectTrigger>
                <SelectContent>
                  {expenseTypes.map(et => (
                    <SelectItem key={et.id} value={String(et.id)}>{et.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline" size="icon"
                title="Agregar tipo"
                onClick={() => setShowAddType(v => !v)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showAddType && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  placeholder="Nombre del tipo…"
                  className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleAddType()}
                />
                <Button
                  size="sm" onClick={handleAddType} disabled={addingType}
                  className="shrink-0"
                >
                  {addingType ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
                </Button>
              </div>
            )}
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label>Descripción <span className="text-gray-400 text-xs">(opcional)</span></Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Pago cuota seguro"
              className="text-sm"
            />
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <Label>Monto ($) <span className="text-red-500">*</span></Label>
            <Input
              type="number" min={0} step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="text-sm"
              autoFocus={!showAddType}
            />
          </div>

          {/* Forma de pago */}
          <div className="space-y-1.5">
            <Label>Forma de pago</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {PAY_METHODS.map(pm => (
                <button
                  key={pm.value}
                  onClick={() => setPayMethod(pm.value)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all
                    ${payMethod === pm.value
                      ? pm.color + ' ring-1 ring-offset-1 ring-current'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                >
                  {pm.icon}
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Usuario */}
          <div className="space-y-1.5">
            <Label>Registrado por</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Seleccioná usuario…" />
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar gasto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function PosTerminal() {
  // ── Infra ──────────────────────────────────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<string>('')
  const [session,  setSession ] = useState<PosSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)

  // ── Usuarios ───────────────────────────────────────────────────────────
  const [users,            setUsers           ] = useState<AppUser[]>([])
  const [currentUserId,    setCurrentUserId   ] = useState<number | null>(null)
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({
    business_name: null, whatsapp_report_number: null,
    business_logo: null, receipt_phone: null,
    receipt_address: null, receipt_footer: null, receipt_no_invoice_text: null,
  })

  // ── Búsqueda ───────────────────────────────────────────────────────────
  const [query,         setQuery        ] = useState('')
  const [searchResults, setSearchResults] = useState<Variant[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showResults,   setShowResults  ] = useState(false)
  const searchRef   = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Carrito ────────────────────────────────────────────────────────────
  const [cart,          setCart         ] = useState<CartItem[]>([])
  const [discountType,  setDiscountType ] = useState<'pct' | 'amt'>('pct')
  const [discountValue, setDiscountValue] = useState('')
  const [payMethod,     setPayMethod    ] = useState<PayMethod>('efectivo')
  const [invoiceNum,    setInvoiceNum   ] = useState('')
  const [processing,    setProcessing   ] = useState(false)

  // ── Dialogs ────────────────────────────────────────────────────────────
  const [showOpenSession,  setShowOpenSession ] = useState(false)
  const [showCloseSession, setShowCloseSession] = useState(false)
  const [cameraOpen,       setCameraOpen      ] = useState(false)
  const [showExpense,      setShowExpense     ] = useState(false)
  const [showExchange,     setShowExchange    ] = useState(false)
  const [showReceipt,      setShowReceipt     ] = useState(false)
  const [lastReceiptData,  setLastReceiptData ] = useState<ReceiptData | null>(null)
  const [showTodaySales,   setShowTodaySales  ] = useState(false)

  // ── Totales ────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + i.unit_price, 0)
  const discountAmount = useMemo(() => {
    const v = parseFloat(discountValue) || 0
    return discountType === 'pct' ? subtotal * (v / 100) : v
  }, [subtotal, discountValue, discountType])
  const total = Math.max(0, subtotal - discountAmount)

  // ── Carga de sucursales ────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/branches').then(r => r.json()).then((bs: Branch[]) => {
      setBranches(bs)
      const def = bs.find(b => b.is_default) ?? (bs.length === 1 ? bs[0] : null)
      if (def) setBranchId(String(def.id))
    })
  }, [])

  // ── Carga de ajustes del negocio ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((s: Record<string, string | null>) =>
        setBusinessSettings({
          business_name:           s.business_name           ?? null,
          whatsapp_report_number:  s.whatsapp_report_number  ?? null,
          business_logo:           s.business_logo           ?? null,
          receipt_phone:           s.receipt_phone           ?? null,
          receipt_address:         s.receipt_address         ?? null,
          receipt_footer:          s.receipt_footer          ?? null,
          receipt_no_invoice_text: s.receipt_no_invoice_text ?? null,
        })
      ).catch(() => {})
  }, [])

  // ── Carga de usuarios + usuario guardado ───────────────────────────────
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((us: AppUser[]) => {
        setUsers(us)
        const saved = localStorage.getItem('roi_pos_user_id')
        if (saved) {
          const id = parseInt(saved)
          if (us.some(u => u.id === id)) setCurrentUserId(id)
        }
      })
      .catch(() => {})
  }, [])

  const handleUserChange = (val: string) => {
    const id = val === '__none__' ? null : parseInt(val)
    setCurrentUserId(id)
    if (id) localStorage.setItem('roi_pos_user_id', String(id))
    else    localStorage.removeItem('roi_pos_user_id')
  }

  // ── Carga de sesión activa cuando cambia la sucursal ──────────────────
  const loadSession = useCallback(async (bid: string) => {
    if (!bid) return
    setSessionLoading(true)
    try {
      const data = await fetch(`/api/pos/sessions?branch_id=${bid}`).then(r => r.json())
      setSession(data.session)
    } catch { toast.error('Error al cargar sesión de caja') }
    finally  { setSessionLoading(false) }
  }, [])

  useEffect(() => { if (branchId) loadSession(branchId) }, [branchId, loadSession])

  // ── Auto-foco en el input de búsqueda ─────────────────────────────────
  useEffect(() => { searchRef.current?.focus() }, [session])

  // ── Búsqueda con debounce ──────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !branchId) { setSearchResults([]); return }
    setSearchLoading(true)
    try {
      const data = await fetch(
        `/api/pos/lookup?q=${encodeURIComponent(q)}&branch_id=${branchId}`
      ).then(r => r.json())

      if (data.mode === 'exact' && data.results.length === 1) {
        // Coincidencia exacta → agregar directo al carrito
        addToCart(data.results[0])
        setQuery(''); setSearchResults([]); setShowResults(false)
        return
      }
      setSearchResults(data.results ?? [])
      setShowResults(true)
    } catch { toast.error('Error en la búsqueda') }
    finally  { setSearchLoading(false) }
  }, [branchId]) // eslint-disable-line

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setSearchResults([]); setShowResults(false); return }
    debounceRef.current = setTimeout(() => doSearch(value), 350)
  }

  const handleQueryEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    doSearch(query)
  }

  // ── Scan por cámara ────────────────────────────────────────────────────
  const handleScan = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery(value)
    doSearch(value)
    searchRef.current?.focus()
  }, [doSearch])

  // ── Manejo del carrito ─────────────────────────────────────────────────
  const addToCart = (variant: Variant) => {
    if (cart.some(i => i.id === variant.id)) {
      toast.warning('Esa prenda ya está en el carrito'); return
    }
    setCart(prev => [...prev, { ...variant, unit_price: variant.base_price }])
    toast.success(`${variant.product_name} T.${variant.size} agregada`, { duration: 1500 })
    setQuery(''); setSearchResults([]); setShowResults(false)
    searchRef.current?.focus()
  }

  const removeFromCart = (variantId: number) =>
    setCart(prev => prev.filter(i => i.id !== variantId))

  const updatePrice = (variantId: number, price: number) =>
    setCart(prev => prev.map(i => i.id === variantId ? { ...i, unit_price: price } : i))

  const clearCart = () => {
    setCart([]); setDiscountValue(''); setInvoiceNum('')
    setPayMethod('efectivo')
    searchRef.current?.focus()
  }

  // ── Confirmar venta ────────────────────────────────────────────────────
  const handleConfirmSale = async () => {
    if (cart.length === 0) { toast.error('El carrito está vacío'); return }
    if (!session)          { toast.error('Abrí la caja primero');  return }

    setProcessing(true)

    // Capturar estado del carrito antes de limpiar
    const snapItems         = [...cart]
    const snapSubtotal      = subtotal
    const snapDiscountAmt   = discountAmount
    const snapDiscountVal   = discountValue
    const snapDiscountType  = discountType
    const snapTotal         = total
    const snapPayMethod     = payMethod
    const snapInvoiceNum    = invoiceNum
    const snapBranchId      = parseInt(branchId)

    try {
      const res  = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id:       snapBranchId,
          pos_session_id:  session.id,
          invoice_number:  snapInvoiceNum.trim() || null,
          discount_amount: snapDiscountAmt,
          payment_method:  snapPayMethod,
          items: snapItems.map(i => ({ variant_id: i.id, unit_price: i.unit_price })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(data.message)
      clearCart()
      loadSession(branchId)

      // Preparar datos del recibo y mostrarlo
      const payDef = PAY_METHODS.find(p => p.value === snapPayMethod)
      setLastReceiptData({
        items:          snapItems,
        subtotal:       snapSubtotal,
        discountAmount: snapDiscountAmt,
        discountValue:  snapDiscountVal,
        discountType:   snapDiscountType,
        total:          snapTotal,
        payMethodLabel: payDef?.label ?? snapPayMethod,
        invoiceNum:     snapInvoiceNum,
        saleId:         data.id,
        branchId:       snapBranchId,
      })
      setShowReceipt(true)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  // ── Abrir sesión ───────────────────────────────────────────────────────
  const handleOpenSession = async (openingBalance: number) => {
    try {
      const res  = await fetch('/api/pos/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id:          parseInt(branchId),
          opening_balance:    openingBalance,
          opened_by_user_id:  currentUserId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSession(data)
      setShowOpenSession(false)
      toast.success('Caja abierta')
    } catch (err: unknown) { toast.error((err as Error).message) }
  }

  // ── Cerrar sesión ──────────────────────────────────────────────────────
  const handleCloseSession = async (closingBalance: number, notes: string) => {
    if (!session) return
    try {
      const res  = await fetch(`/api/pos/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closing_balance:   closingBalance,
          notes,
          closed_by_user_id: currentUserId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSession(null)
      setShowCloseSession(false)
      clearCart()
      toast.success('Caja cerrada correctamente')
    } catch (err: unknown) { toast.error((err as Error).message) }
  }

  const payMethodDef = PAY_METHODS.find(p => p.value === payMethod)!

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* ── Barra de sesión ─────────────────────────────────────────────── */}
      <header className="bg-white border-b shadow-sm px-4 py-2 flex flex-wrap items-center gap-3">
        <ShoppingCart className="h-5 w-5 text-violet-600 shrink-0" />
        <span className="font-bold text-gray-800 text-sm">POS</span>

        {/* Selector de sucursal */}
        {branches.length > 1 && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-8 text-sm w-44">
              <SelectValue placeholder="Seleccioná sucursal…" />
            </SelectTrigger>
            <SelectContent>
              {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {branches.length === 1 && (
          <span className="text-sm text-gray-600 font-medium">{branches[0]?.name}</span>
        )}

        {/* Selector de usuario */}
        {users.length > 0 && (
          <Select
            value={currentUserId ? String(currentUserId) : '__none__'}
            onValueChange={handleUserChange}
          >
            <SelectTrigger className="h-8 text-sm w-40">
              <SelectValue placeholder="¿Quién sos?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span className="italic text-gray-400">Sin usuario</span>
              </SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Estado de sesión */}
        {branchId && (
          sessionLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : session ? (
            <>
              <Badge variant="outline" className="border-green-400 text-green-700 gap-1 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Caja abierta desde {fmtTime(session.opened_at)}
              </Badge>
              <span className="text-xs text-gray-400 hidden sm:block">
                {session.sales_count} venta{session.sales_count !== 1 ? 's' : ''} · {fmt(session.sales_total)}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  className="text-violet-600 border-violet-200 hover:bg-violet-50 gap-1.5"
                  onClick={() => setShowExchange(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Cambio
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="text-amber-600 border-amber-200 hover:bg-amber-50 gap-1.5"
                  onClick={() => setShowExpense(true)}
                >
                  <Receipt className="h-3.5 w-3.5" />
                  Gasto
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="text-gray-600 border-gray-200 hover:bg-gray-50 gap-1.5"
                  onClick={() => setShowTodaySales(true)}
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ventas del día</span>
                  <span className="sm:hidden">Ventas</span>
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                  onClick={() => setShowCloseSession(true)}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Cerrar caja
                </Button>
              </div>
            </>
          ) : (
            <Button
              variant="outline" size="sm"
              className="ml-auto text-green-700 border-green-300 hover:bg-green-50 gap-1.5"
              onClick={() => setShowOpenSession(true)}
            >
              <Unlock className="h-3.5 w-3.5" />
              Abrir caja
            </Button>
          )
        )}
      </header>

      {/* ── Cuerpo principal ─────────────────────────────────────────────── */}
      {!branchId ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p className="text-center">Seleccioná una sucursal para comenzar</p>
        </div>
      ) : !session ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-400">
          <Lock className="h-12 w-12 text-gray-300" />
          <p className="font-medium text-gray-500">La caja está cerrada</p>
          <Button onClick={() => setShowOpenSession(true)} className="gap-2">
            <Unlock className="h-4 w-4" />
            Abrir caja para vender
          </Button>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0">

          {/* ── Panel izquierdo: búsqueda ──────────────────────────────── */}
          <div className="p-4 space-y-4 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Escaneá o buscá una prenda
            </p>

            {/* Input de búsqueda */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  ref={searchRef}
                  className="pl-9 pr-10 h-11 text-base bg-white"
                  placeholder="Código, SKU o palabras: jean gris T14…"
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  onKeyDown={handleQueryEnter}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  autoComplete="off"
                />
                {query && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => { setQuery(''); setSearchResults([]); setShowResults(false); searchRef.current?.focus() }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Botón cámara */}
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                title="Escanear con cámara"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>

            {/* Scanner por cámara */}
            <CameraScanner
              open={cameraOpen}
              onClose={() => setCameraOpen(false)}
              onScan={handleScan}
            />

            {/* Resultados */}
            {searchLoading && (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            )}

            {showResults && searchResults.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {searchResults.map(v => (
                    <button
                      key={v.id}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 transition-colors text-left"
                      onClick={() => addToCart(v)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{v.product_name}</p>
                        <p className="text-xs text-gray-400">
                          {v.color} · T.{v.size}
                          {v.category_name && <> · {v.category_name}</>}
                        </p>
                        <p className="text-xs text-gray-300 font-mono mt-0.5">{v.sku}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-800">{fmt(v.base_price)}</p>
                        <Badge variant="outline" className="text-[10px] mt-0.5">Agregar</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showResults && searchResults.length === 0 && !searchLoading && query && (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <AlertTriangle className="h-4 w-4" />
                No se encontró ninguna prenda con ese código o nombre en esta sucursal.
              </div>
            )}
          </div>

          {/* ── Panel derecho: carrito ─────────────────────────────────── */}
          <div className="bg-white border-l border-gray-200 flex flex-col">

            {/* Encabezado carrito */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-800 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-violet-600" />
                Carrito
                {cart.length > 0 && (
                  <Badge className="bg-violet-100 text-violet-700 text-xs">{cart.length}</Badge>
                )}
              </span>
              {cart.length > 0 && (
                <button
                  className="text-xs text-red-400 hover:text-red-600"
                  onClick={clearCart}
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Items del carrito */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-2">
                  <ShoppingCart className="h-8 w-8" />
                  <p className="text-sm">El carrito está vacío</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="px-4 py-2.5 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-400">{item.color} · T.{item.size}</p>
                    </div>
                    {/* Precio editable */}
                    <div className="relative w-24 shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        min={0}
                        className="w-full pl-5 pr-1 py-1 text-sm text-right border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
                        value={item.unit_price}
                        onChange={e => updatePrice(item.id, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <button
                      className="text-gray-300 hover:text-red-400 mt-0.5 shrink-0"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Panel de pago */}
            <div className="border-t border-gray-200 px-4 py-4 space-y-3">

              {/* Descuento */}
              <div className="flex items-center gap-2">
                <button
                  className="text-xs text-gray-500 border rounded px-2 py-0.5 hover:bg-gray-50 shrink-0"
                  onClick={() => setDiscountType(d => d === 'pct' ? 'amt' : 'pct')}
                  title="Cambiar tipo de descuento"
                >
                  {discountType === 'pct' ? '%' : '$'}
                </button>
                <Input
                  type="number" min={0}
                  placeholder={discountType === 'pct' ? 'Descuento %' : 'Descuento $'}
                  className="h-8 text-sm"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                />
                <Input
                  placeholder="Nro. comprobante"
                  className="h-8 text-sm"
                  value={invoiceNum}
                  onChange={e => setInvoiceNum(e.target.value)}
                />
              </div>

              {/* Totales */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{fmt(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Descuento {discountType === 'pct' ? `(${discountValue}%)` : ''}</span>
                    <span className="tabular-nums">−{fmt(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg text-gray-900 pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span className="tabular-nums">{fmt(total)}</span>
                </div>
              </div>

              {/* Forma de pago */}
              <div className="grid grid-cols-5 gap-1">
                {PAY_METHODS.map(pm => (
                  <button
                    key={pm.value}
                    title={pm.label}
                    onClick={() => setPayMethod(pm.value)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      payMethod === pm.value
                        ? pm.color + ' border-2'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {pm.icon}
                    <span className="text-[9px] leading-none hidden sm:block">{pm.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-gray-500 -mt-1">
                {payMethodDef.label}
              </p>

              {/* Botón confirmar */}
              <Button
                className="w-full h-12 text-base gap-2"
                disabled={cart.length === 0 || processing}
                onClick={handleConfirmSale}
              >
                {processing
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <CheckCircle2 className="h-5 w-5" />
                }
                Confirmar venta · {fmt(total)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      {showOpenSession && branchId && (
        <OpenSessionDialog
          branch={branches.find(b => b.id === parseInt(branchId))!}
          onConfirm={handleOpenSession}
          onClose={() => setShowOpenSession(false)}
        />
      )}
      {showCloseSession && session && (
        <CloseSessionDialog
          session={session}
          businessSettings={businessSettings}
          closingUserName={users.find(u => u.id === currentUserId)?.name ?? null}
          onConfirm={handleCloseSession}
          onClose={() => setShowCloseSession(false)}
        />
      )}
      {showExpense && session && (
        <ExpenseDialog
          session={session}
          branchId={parseInt(branchId)}
          users={users}
          currentUserId={currentUserId}
          onClose={() => setShowExpense(false)}
          onSaved={() => { setShowExpense(false); loadSession(branchId) }}
        />
      )}
      {showExchange && session && (
        <ExchangeDialog
          session={session}
          branchId={parseInt(branchId)}
          users={users}
          currentUserId={currentUserId}
          onClose={() => setShowExchange(false)}
          onSaved={() => { setShowExchange(false); loadSession(branchId) }}
        />
      )}
      {showReceipt && lastReceiptData && (
        <ReceiptDialog
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          data={lastReceiptData}
          settings={businessSettings as ReceiptSettings}
        />
      )}
      {showTodaySales && branchId && (
        <TodaySalesDialog
          open={showTodaySales}
          onClose={() => setShowTodaySales(false)}
          branchId={parseInt(branchId)}
          settings={businessSettings as ReceiptSettings}
        />
      )}
    </div>
  )
}
