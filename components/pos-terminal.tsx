"use client"

import {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react"
import {
  ShoppingCart, Search, Trash2, Loader2, CheckCircle2,
  AlertTriangle, X, CreditCard, Banknote, Smartphone,
  ArrowDownUp, ChevronDown, Camera, Plus, Lock, Unlock,
  Receipt, RefreshCw, ReceiptText, Vault,
} from "lucide-react"
import {
  OpenSessionContent, CloseSessionContent,
  type PosSessionFull,
} from "@/components/pos-session-dialogs"
import { getSession }      from "@/lib/session"
import { fetchEnabledPaymentMethods, type PayMethod } from "@/lib/payment-methods"
import { CameraScanner }   from "@/components/camera-scanner"
import { ExchangeDialog }  from "@/components/exchange-dialog"
import { ReceiptDialog, type ReceiptData, type ReceiptSettings } from "@/components/receipt-dialog"
import { TodaySalesDialog } from "@/components/today-sales-dialog"
import { usePlanCan } from "@/components/PlanGate"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Badge }    from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
interface SalesByUser {
  user_id:     number | null
  user_name:   string
  sales_count: number
  sales_total: number
}

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
  sales_by_user: SalesByUser[] | null
  // gastos
  expense_count: number; expense_total: number
  expense_cash_total: number; expense_debit_total: number
  expense_credit_total: number; expense_mp_total: number; expense_transfer_total: number
  // retiros a Caja Central
  withdrawal_total: number
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
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle /></DialogHeader>
        <OpenSessionContent
          branchName={branch.name}
          onConfirm={onConfirm}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}

// ── Diálogo: cerrar caja ───────────────────────────────────────────────────────
function CloseSessionDialog({
  session,
  businessSettings,
  closingUserName,
  onConfirm,
  onClose,
}: {
  session:          PosSessionFull
  businessSettings: BusinessSettings
  closingUserName:  string | null
  onConfirm:        (closing: number, notes: string) => Promise<void>
  onClose:          () => void
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle /></DialogHeader>
        <CloseSessionContent
          session={session}
          businessSettings={businessSettings}
          closingUserName={closingUserName}
          onConfirm={onConfirm}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}

// ── Diálogo: registrar gasto ───────────────────────────────────────────────────
function ExpenseDialog({
  session,
  branchId,
  payMethods,
  users,
  currentUserId,
  onClose,
  onSaved,
}: {
  session:       PosSession
  branchId:      number
  payMethods:    typeof PAY_METHODS
  users:         AppUser[]
  currentUserId: number | null
  onClose:       () => void
  onSaved:       () => void
}) {
  const [expenseTypes,   setExpenseTypes  ] = useState<ExpenseType[]>([])
  const [expenseTypeId,  setExpenseTypeId ] = useState('')
  const [description,    setDescription  ] = useState('')
  const [amount,         setAmount       ] = useState('')
  const [payMethod,      setPayMethod    ] = useState<PayMethod>(payMethods[0]?.value ?? 'efectivo')
  const [userId,         setUserId       ] = useState(currentUserId ? String(currentUserId) : '')
  const [saving,         setSaving       ] = useState(false)

  useEffect(() => {
    if (!payMethods.some(pm => pm.value === payMethod)) setPayMethod(payMethods[0]?.value ?? 'efectivo')
  }, [payMethods, payMethod])

  useEffect(() => {
    fetch('/api/expense-types')
      .then(r => r.json())
      .then((data: ExpenseType[]) => setExpenseTypes(data))
      .catch(() => toast.error('Error al cargar tipos de gasto'))
  }, [])

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
            <Select value={expenseTypeId} onValueChange={setExpenseTypeId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Seleccioná un tipo…" />
              </SelectTrigger>
              <SelectContent>
                {expenseTypes.map(et => (
                  <SelectItem key={et.id} value={String(et.id)}>{et.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              autoFocus
            />
          </div>

          {/* Forma de pago */}
          <div className="space-y-1.5">
            <Label>Forma de pago</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {payMethods.map(pm => (
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

// ── Diálogo: Retiro a Caja Central ────────────────────────────────────────────
function WithdrawalDialog({
  session,
  branchId,
  currentUserId,
  onClose,
  onSaved,
}: {
  session:       PosSession
  branchId:      number
  currentUserId: number | null
  onClose:       () => void
  onSaved:       () => void
}) {
  const [amount,  setAmount ] = useState('')
  const [notes,   setNotes  ] = useState('')
  const [saving,  setSaving ] = useState(false)

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast.error('Ingresá un monto válido'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/cash-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pos_session_id: session.id,
          from_branch_id: branchId,
          amount:         amt,
          notes:          notes.trim() || null,
          user_id:        currentUserId ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Retiro de ${fmt(amt)} registrado en Caja Central`)
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
            <Vault className="h-5 w-5 text-orange-600" />
            Retiro a Caja Central
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-xs text-gray-500">
            El efectivo sale de esta sucursal y queda registrado en Caja Central.
          </p>
          <div className="space-y-1.5">
            <Label>Monto a retirar ($) <span className="text-red-500">*</span></Label>
            <Input
              autoFocus type="number" min={0} step="0.01" placeholder="0"
              value={amount} onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo / Notas <span className="text-gray-400 text-xs">(opcional)</span></Label>
            <Input
              placeholder="Ej: Pago proveedor, depósito banco…"
              value={notes} onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !amount || parseFloat(amount) <= 0}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar retiro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Mensajes motivadores ───────────────────────────────────────────────────────
const WELCOME_MESSAGES = [
  { emoji: '🌟', phrase: '¡Que fluyan las ventas hoy!',                        accent: '#7c3aed' },
  { emoji: '💪', phrase: 'A romperla. Hoy es un gran día.',                     accent: '#059669' },
  { emoji: '✨', phrase: 'Cada cliente es una oportunidad.',                    accent: '#d97706' },
  { emoji: '🚀', phrase: '¡Arriba el equipo! A vender con todo.',               accent: '#2563eb' },
  { emoji: '🎯', phrase: 'Foco, energía y buenas ventas.',                      accent: '#db2777' },
  { emoji: '💎', phrase: 'Calidad en cada prenda, sonrisa en cada cliente.',    accent: '#0891b2' },
  { emoji: '🛍️', phrase: '¡Que el local brille hoy!',                          accent: '#7c3aed' },
  { emoji: '🌸', phrase: 'Buen humor + buena atención = ventas.',               accent: '#e11d48' },
  { emoji: '☀️', phrase: '¡Buen día! La energía es el secreto.',               accent: '#ea580c' },
  { emoji: '🎉', phrase: '¡Nuevo día, nuevas oportunidades!',                   accent: '#0d9488' },
  { emoji: '💫', phrase: 'Hoy se vende, mañana se vende más.',                  accent: '#4f46e5' },
  { emoji: '🌈', phrase: 'La actitud lo es todo. ¡Adelante!',                  accent: '#16a34a' },
  { emoji: '🏆', phrase: '¡Equipo campeón, a por el objetivo!',                 accent: '#b45309' },
  { emoji: '👑', phrase: 'Tratá a cada cliente como una reina.',                accent: '#ca8a04' },
]

function WelcomeModal({
  userName,
  onClose,
}: {
  userName: string | null
  onClose:  () => void
}) {
  const DURATION = 4500
  const [visible, setVisible] = useState(true)

  // Mismo mensaje para todo el día, distinto cada día del año
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
  )
  const msg = WELCOME_MESSAGES[dayOfYear % WELCOME_MESSAGES.length]

  // Saludo según la hora
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const greeting = userName ? `¡${timeGreeting}, ${userName}!` : `¡${timeGreeting}!`

  const dismiss = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  useEffect(() => {
    const t = setTimeout(dismiss, DURATION)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-300 cursor-pointer
        ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={dismiss}
    >
      {/* Fondo */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Tarjeta */}
      <div
        className="relative bg-white rounded-3xl shadow-2xl px-8 py-9 mx-4 max-w-xs w-full text-center overflow-hidden cursor-default"
        onClick={e => e.stopPropagation()}
      >
        {/* Emoji */}
        <div className="text-7xl leading-none mb-5 select-none">{msg.emoji}</div>

        {/* Saludo */}
        <h2 className="text-xl font-bold text-gray-900 mb-2">{greeting}</h2>

        {/* Frase del día */}
        <p className="text-gray-500 text-sm leading-relaxed mb-7">{msg.phrase}</p>

        {/* Toque para cerrar */}
        <p className="text-[11px] text-gray-300 mb-1">Tocá en cualquier lugar para cerrar</p>

        {/* Barra de progreso */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100 rounded-b-3xl overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              background: msg.accent,
              animation: `welcomeBar ${DURATION}ms linear forwards`,
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes welcomeBar {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>
    </div>
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
  const [payMethods,    setPayMethods   ] = useState(PAY_METHODS)
  const [invoiceNum,    setInvoiceNum   ] = useState('')
  const [processing,    setProcessing   ] = useState(false)

  // ── Pago mixto ─────────────────────────────────────────────────────────
  const [mixedMode, setMixedMode] = useState(false)
  const [splitAmts, setSplitAmts] = useState<Partial<Record<PayMethod, string>>>({})

  const splitTotal   = (t: number) => Object.values(splitAmts).reduce((s, v) => s + (parseFloat(v || '0') || 0), 0)
  const splitDiff    = (t: number) => t - splitTotal(t)
  const activeSplits = Object.entries(splitAmts).filter(([, v]) => parseFloat(v || '0') > 0) as [PayMethod, string][]

  const toggleMixedMode = (t: number) => {
    if (!mixedMode) {
      setSplitAmts({ [payMethod]: String(t) })
    } else {
      setSplitAmts({})
    }
    setMixedMode(v => !v)
  }

  const setSplitAmt = (method: PayMethod, value: string) => {
    setSplitAmts(prev => ({ ...prev, [method]: value }))
  }

  // ── Facturación ARCA ──────────────────────────────────────────────────
  const [cuitEmisor, setCuitEmisor] = useState<string>('')

  // ── Dialogs ────────────────────────────────────────────────────────────
  const [showOpenSession,  setShowOpenSession  ] = useState(false)
  const [showCloseSession, setShowCloseSession ] = useState(false)
  const [showWelcome,      setShowWelcome      ] = useState(false)
  const [cameraOpen,       setCameraOpen       ] = useState(false)
  const [showExpense,      setShowExpense      ] = useState(false)
  const [showExchange,     setShowExchange     ] = useState(false)
  const canExpenses = usePlanCan('expenses.view')
  const [showReceipt,      setShowReceipt      ] = useState(false)
  const [lastReceiptData,  setLastReceiptData  ] = useState<ReceiptData | null>(null)
  const [showTodaySales,   setShowTodaySales   ] = useState(false)
  const [showWithdrawal,   setShowWithdrawal   ] = useState(false)

  // Rol del usuario logueado (para controles exclusivos de admin)
  const isAdmin = getSession()?.role === 'administrador'

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

  // ── Carga de usuarios — preselecciona el usuario logueado ────────────
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((us: AppUser[]) => {
        setUsers(us)
        // Primero intentar con la sesión de Google login
        const sessionRaw = localStorage.getItem('roipos_user')
        if (sessionRaw) {
          const s = JSON.parse(sessionRaw) as { id: number; email: string }
          const match = us.find(u => u.id === s.id)
          if (match) { setCurrentUserId(match.id); return }
        }
        // Fallback: usuario guardado manualmente
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

  // ── Formas de pago habilitadas para la sucursal (fops.use_for_sales) ──
  useEffect(() => {
    if (!branchId) return
    fetchEnabledPaymentMethods(parseInt(branchId))
      .then(enabled => {
        const filtered = PAY_METHODS.filter(pm => enabled.has(pm.value))
        setPayMethods(filtered.length > 0 ? filtered : PAY_METHODS)
      })
      .catch(() => setPayMethods(PAY_METHODS))
  }, [branchId])

  // Si la forma de pago seleccionada deja de estar disponible, cae a la primera habilitada
  useEffect(() => {
    if (!payMethods.some(pm => pm.value === payMethod)) setPayMethod(payMethods[0]?.value ?? 'efectivo')
  }, [payMethods, payMethod])

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

  // Cargar CUIT emisor para la sucursal seleccionada
  useEffect(() => {
    if (!branchId) { setCuitEmisor(''); return }
    fetch(`/api/facturacion/config?branchId=${branchId}`)
      .then(r => r.json())
      .then((d: { cuit: string | null }) => setCuitEmisor(d.cuit ?? ''))
      .catch(() => setCuitEmisor(''))
  }, [branchId])

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
    setMixedMode(false); setSplitAmts({})
    searchRef.current?.focus()
  }

  // ── Confirmar venta ────────────────────────────────────────────────────
  const handleConfirmSale = async () => {
    if (cart.length === 0) { toast.error('El carrito está vacío'); return }
    if (!session)          { toast.error('Abrí la caja primero');  return }

    // Validación pago mixto
    if (mixedMode) {
      const diff = splitDiff(total)
      if (Math.abs(diff) > 1) {
        toast.error(`El total asignado (${fmt(splitTotal(total))}) no coincide con el total de la venta (${fmt(total)}).`)
        return
      }
    }

    setProcessing(true)

    const snapItems        = [...cart]
    const snapSubtotal     = subtotal
    const snapDiscountAmt  = discountAmount
    const snapDiscountVal  = discountValue
    const snapDiscountType = discountType
    const snapTotal        = total
    const snapPayMethod    = payMethod
    const snapInvoiceNum   = invoiceNum
    const snapBranchId     = parseInt(branchId)

    // Construir split para la API
    const snapSplit: Partial<Record<PayMethod, number>> | null = mixedMode
      ? Object.fromEntries(
          Object.entries(splitAmts)
            .map(([k, v]) => [k, parseFloat(v || '0') || 0])
            .filter(([, v]) => (v as number) > 0)
        ) as Partial<Record<PayMethod, number>>
      : null

    // Método principal = el de mayor monto en el split (o el único)
    const snapPrimaryMethod = snapSplit
      ? (Object.entries(snapSplit).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] as PayMethod ?? snapPayMethod)
      : snapPayMethod

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id:       snapBranchId,
          pos_session_id:  session.id,
          invoice_number:  snapInvoiceNum.trim() || null,
          discount_amount: snapDiscountAmt,
          payment_method:  snapPrimaryMethod,
          payment_split:   snapSplit,
          user_id:         currentUserId ?? null,
          items: snapItems.map(i => ({ variant_id: i.id, unit_price: i.unit_price })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(data.message)
      clearCart()
      loadSession(branchId)

      // Preparar datos del recibo
      const payLabel = snapSplit
        ? Object.entries(snapSplit)
            .filter(([, amt]) => (amt as number) > 0)
            .map(([k, amt]) => `${PAY_METHODS.find(p => p.value === k)?.label ?? k}: ${fmt(amt as number)}`)
            .join(' / ')
        : (PAY_METHODS.find(p => p.value === snapPayMethod)?.label ?? snapPayMethod)

      setLastReceiptData({
        items:          snapItems,
        subtotal:       snapSubtotal,
        discountAmount: snapDiscountAmt,
        discountValue:  snapDiscountVal,
        discountType:   snapDiscountType,
        total:          snapTotal,
        payMethodLabel: payLabel,
        paymentSplit:   snapSplit ?? undefined,
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
      await loadSession(branchId)
      setShowOpenSession(false)
      setShowWelcome(true)
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

      // Grabar snapshot de stock del día (silencioso — no bloquea si falla)
      fetch('/api/snapshots/stock', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ branch_id: parseInt(branchId), pos_session_id: session.id }),
      }).catch(() => {})

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
      <header className="bg-white border-b shadow-sm px-3 py-2">
        {/* Fila 1: sucursal + usuario + estado */}
        <div className="flex items-center gap-2 flex-wrap">
          <ShoppingCart className="h-4 w-4 text-violet-600 shrink-0" />

          {branches.length > 1 ? (
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue placeholder="Sucursal…" />
              </SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs font-medium text-gray-600">{branches[0]?.name}</span>
          )}

          {currentUserId && (() => {
            const u = users.find(u => u.id === currentUserId)
            const firstName = u?.name?.split(' ')[0] ?? ''
            return firstName
              ? <span className="text-xs font-medium text-violet-700">· {firstName}</span>
              : null
          })()}

          {branchId && (
            sessionLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
              : session
                ? <Badge variant="outline" className="border-green-400 text-green-700 gap-1 text-[10px] py-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    {fmtTime(session.opened_at)} · {fmt(session.sales_total)}
                  </Badge>
                : null
          )}

          {/* Acciones — desktop: botones, mobile: menú */}
          {branchId && !sessionLoading && (
            <div className="ml-auto flex items-center gap-1.5">
              {session ? (<>
                {/* Desktop: botones completos */}
                <Button variant="outline" size="sm"
                  className="hidden sm:flex text-violet-600 border-violet-200 hover:bg-violet-50 gap-1.5"
                  onClick={() => setShowExchange(true)}>
                  <RefreshCw className="h-3.5 w-3.5" />Cambio
                </Button>
                <Button variant="outline" size="sm"
                  className={`hidden sm:flex gap-1.5 ${canExpenses ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : 'text-gray-300 border-gray-200'}`}
                  onClick={() => canExpenses ? setShowExpense(true) : toast('Puede subir de Plan para acceder a esta Funcionalidad', { duration: 3000 })}>
                  <Receipt className="h-3.5 w-3.5" />Gasto
                </Button>
                <Button variant="outline" size="sm"
                  className="hidden sm:flex text-gray-600 border-gray-200 hover:bg-gray-50 gap-1.5"
                  onClick={() => setShowTodaySales(true)}>
                  <ReceiptText className="h-3.5 w-3.5" />Ventas del día
                </Button>
                {isAdmin && (
                  <Button variant="outline" size="sm"
                    className="hidden sm:flex text-orange-600 border-orange-200 hover:bg-orange-50 gap-1.5"
                    onClick={() => setShowWithdrawal(true)}>
                    <Vault className="h-3.5 w-3.5" />Caja Central
                  </Button>
                )}
                <Button variant="outline" size="sm"
                  className="hidden sm:flex text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                  onClick={() => setShowCloseSession(true)}>
                  <Lock className="h-3.5 w-3.5" />Cerrar caja
                </Button>

                {/* Mobile: un solo botón con menú */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="sm:hidden gap-1 text-xs px-2">
                      <ChevronDown className="h-3.5 w-3.5" />Caja
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setShowExchange(true)} className="gap-2">
                      <RefreshCw className="h-4 w-4 text-violet-600" />Cambio
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => canExpenses ? setShowExpense(true) : toast('Puede subir de Plan para acceder a esta Funcionalidad', { duration: 3000 })}
                      className={`gap-2 ${!canExpenses ? 'text-gray-300' : ''}`}>
                      <Receipt className={`h-4 w-4 ${canExpenses ? 'text-amber-600' : 'text-gray-300'}`} />Gasto
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowTodaySales(true)} className="gap-2">
                      <ReceiptText className="h-4 w-4 text-gray-600" />Ventas del día
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem onClick={() => setShowWithdrawal(true)} className="gap-2 text-orange-600">
                        <Vault className="h-4 w-4" />Caja Central
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setShowCloseSession(true)} className="gap-2 text-red-600">
                      <Lock className="h-4 w-4" />Cerrar caja
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>) : (
                <Button variant="outline" size="sm"
                  className="text-green-700 border-green-300 hover:bg-green-50 gap-1.5 text-xs"
                  onClick={() => setShowOpenSession(true)}>
                  <Unlock className="h-3.5 w-3.5" />Abrir caja
                </Button>
              )}
            </div>
          )}
        </div>
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
          <div className="bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">

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
              {!mixedMode ? (
                <>
                  <div className="grid grid-cols-5 gap-1">
                    {payMethods.map(pm => (
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
                  <div className="flex items-center justify-between -mt-1">
                    <p className="text-xs text-gray-500">{payMethodDef.label}</p>
                    <button
                      className="text-xs text-violet-500 hover:text-violet-700 underline"
                      onClick={() => toggleMixedMode(total)}
                    >
                      + Pago mixto
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Pago mixto</span>
                    <button
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                      onClick={() => toggleMixedMode(total)}
                    >
                      Cancelar
                    </button>
                  </div>
                  {payMethods.map(pm => (
                    <div key={pm.value} className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseFloat(splitAmts[pm.value] || '0') || 0
                          setSplitAmt(pm.value, current > 0 ? '' : String(total))
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium shrink-0 transition-colors ${
                          parseFloat(splitAmts[pm.value] || '0') > 0
                            ? pm.color + ' border-2'
                            : 'border-gray-200 text-gray-400'
                        }`}
                      >
                        {pm.icon}
                        <span className="w-16 text-left truncate">{pm.label}</span>
                      </button>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                        <input
                          type="number" min={0}
                          placeholder="0"
                          value={splitAmts[pm.value] ?? ''}
                          onChange={e => setSplitAmt(pm.value, e.target.value)}
                          className="w-full pl-5 pr-2 py-1 text-sm text-right border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400"
                        />
                      </div>
                    </div>
                  ))}
                  {/* Diferencia */}
                  {total > 0 && (
                    <div className={`flex justify-between text-xs font-medium px-1 ${
                      Math.abs(splitDiff(total)) <= 1 ? 'text-green-600' : 'text-orange-600'
                    }`}>
                      <span>Asignado: {fmt(splitTotal(total))}</span>
                      {Math.abs(splitDiff(total)) > 1 && (
                        <span>Resta: {fmt(splitDiff(total))}</span>
                      )}
                      {Math.abs(splitDiff(total)) <= 1 && <span>✓ OK</span>}
                    </div>
                  )}
                </div>
              )}

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
          payMethods={payMethods}
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
          cuitEmisor={cuitEmisor || undefined}
          onNuevaVenta={() => { setShowReceipt(false); clearCart() }}
        />
      )}
      {showTodaySales && branchId && (
        <TodaySalesDialog
          open={showTodaySales}
          onClose={() => setShowTodaySales(false)}
          branchId={parseInt(branchId)}
          settings={businessSettings as ReceiptSettings}
          cuitEmisor={cuitEmisor || undefined}
        />
      )}
      {showWithdrawal && session && (
        <WithdrawalDialog
          session={session}
          branchId={parseInt(branchId)}
          currentUserId={currentUserId}
          onClose={() => setShowWithdrawal(false)}
          onSaved={() => { setShowWithdrawal(false); loadSession(branchId) }}
        />
      )}

      {/* Modal de bienvenida al abrir caja */}
      {showWelcome && (
        <WelcomeModal
          userName={
            currentUserId
              ? (users.find(u => u.id === currentUserId)?.name.split(' ')[0] ?? null)
              : null
          }
          onClose={() => setShowWelcome(false)}
        />
      )}
    </div>
  )
}
