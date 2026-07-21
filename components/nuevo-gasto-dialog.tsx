"use client"

import { useState, useEffect } from "react"
import {
  Loader2, Clock, Plus, ChevronRight, CheckCircle2,
  Banknote, CreditCard, Smartphone, ArrowDownUp,
} from "lucide-react"
import { toast } from "sonner"
import { getSession } from "@/lib/session"
import {
  OpenSessionContent, CloseSessionContent,
  type PosSessionFull, type BusinessSettings,
} from "@/components/pos-session-dialogs"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Label }  from "@/components/ui/label"
import { Badge }  from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ── Types ──────────────────────────────────────────────────────────────────────
type PayMethod = 'efectivo' | 'debito' | 'credito' | 'mp' | 'transferencia'
type Step      = 'loading' | 'branch' | 'session' | 'open-balance' | 'expense' | 'saved' | 'close-session'

interface Branch      { id: number; name: string; is_default: boolean }
interface PosSession  { id: number; branch_id: number; opened_at: string; closed_at: string | null; branch_name: string | null }
interface ExpenseType { id: number; name: string }
interface AppUser     { id: number; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const PAY_METHODS = [
  { value: 'efectivo'      as PayMethod, label: 'Efectivo',      icon: <Banknote    className="h-4 w-4" />, color: 'border-green-400   text-green-700   bg-green-50'   },
  { value: 'debito'        as PayMethod, label: 'Débito',        icon: <CreditCard  className="h-4 w-4" />, color: 'border-emerald-400 text-emerald-700 bg-emerald-50'  },
  { value: 'credito'       as PayMethod, label: 'Crédito',       icon: <CreditCard  className="h-4 w-4" />, color: 'border-violet-400  text-violet-700  bg-violet-50'  },
  { value: 'mp'            as PayMethod, label: 'Mercado Pago',  icon: <Smartphone  className="h-4 w-4" />, color: 'border-sky-400     text-sky-700     bg-sky-50'     },
  { value: 'transferencia' as PayMethod, label: 'Transferencia', icon: <ArrowDownUp className="h-4 w-4" />, color: 'border-amber-400   text-amber-700   bg-amber-50'   },
]

const STEP_TITLES: Record<Step, string> = {
  loading:         'Nuevo Gasto',
  branch:          'Seleccioná la sucursal',
  session:         'Seleccioná la sesión',
  'open-balance':  '',
  expense:         'Registrar Gasto',
  saved:           '¡Gasto guardado!',
  'close-session': '',
}

// ══════════════════════════════════════════════════════════════════════════════
export default function NuevoGastoDialog({
  onClose,
  onSaved,
}: {
  onClose:  () => void
  onSaved?: () => void
}) {
  const [step,               setStep              ] = useState<Step>('loading')
  const [branches,           setBranches          ] = useState<Branch[]>([])
  const [branchId,           setBranchId          ] = useState<number | null>(null)
  const [session,            setSession           ] = useState<PosSession | null>(null)
  const [recentSessions,     setRecentSessions    ] = useState<PosSession[]>([])
  const [sessionCreated,     setSessionCreated    ] = useState(false)
  const [closingSessionFull, setClosingSessionFull] = useState<PosSessionFull | null>(null)
  const [closingBizSettings, setClosingBizSettings] = useState<BusinessSettings | null>(null)
  const [closingUserName,    setClosingUserName   ] = useState<string | null>(null)

  // Campos del formulario
  const [expenseTypes,  setExpenseTypes ] = useState<ExpenseType[]>([])
  const [users,         setUsers        ] = useState<AppUser[]>([])
  const [expenseTypeId, setExpenseTypeId] = useState('')
  const [description,   setDescription ] = useState('')
  const [amount,        setAmount      ] = useState('')
  const [payMethod,     setPayMethod   ] = useState<PayMethod>('efectivo')
  const [userId,        setUserId      ] = useState('')
  const [saving,        setSaving      ] = useState(false)
  const [savedAmount,   setSavedAmount ] = useState(0)

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/branches').then(r => r.json()),
      fetch('/api/expense-types').then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
    ]).then(([bs, ets, us]: [Branch[], ExpenseType[], AppUser[]]) => {
      setBranches(bs)
      setExpenseTypes(ets)
      setUsers(us)

      if (!bs.length) { toast.error('No hay sucursales configuradas'); onClose(); return }

      if (bs.length === 1) {
        setBranchId(bs[0].id)
        checkSession(bs[0].id)
      } else {
        const def = bs.find(b => b.is_default)
        if (def) { setBranchId(def.id); checkSession(def.id) }
        else setStep('branch')
      }
    }).catch(() => { toast.error('Error al cargar datos'); onClose() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Verificar sesión ──────────────────────────────────────────────────────
  const checkSession = async (bid: number) => {
    setStep('loading')
    try {
      const [activeRes, recentRes] = await Promise.all([
        fetch(`/api/pos/sessions?branch_id=${bid}`).then(r => r.json()),
        fetch(`/api/pos/sessions?branch_id=${bid}&recent=true`).then(r => r.json()),
      ])
      setSession(activeRes.session ?? null)
      setRecentSessions(recentRes.sessions ?? [])
      setStep(activeRes.session ? 'expense' : 'session')
    } catch {
      toast.error('Error al verificar sesión de caja')
      onClose()
    }
  }

  // ── Crear nueva sesión ────────────────────────────────────────────────────
  const handleCreateSession = async (balance: number) => {
    if (!branchId) return
    try {
      const res = await fetch('/api/pos/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId, opening_balance: balance }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSession(data)
      setSessionCreated(true)
      setStep('expense')
    } catch (err: unknown) { toast.error((err as Error).message) }
  }

  // ── Guardar gasto ─────────────────────────────────────────────────────────
  const handleSaveExpense = async () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!session || !branchId) return
    setSaving(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pos_session_id:  session.id,
          branch_id:       branchId,
          user_id:         userId && userId !== '__none__' ? parseInt(userId) : null,
          expense_type_id: expenseTypeId ? parseInt(expenseTypeId) : null,
          description:     description.trim() || null,
          amount:          amt,
          payment_method:  payMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedAmount(amt)
      toast.success(`Gasto de ${fmt(amt)} registrado`)
      onSaved?.()
      setStep('saved')
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Registrar otro ────────────────────────────────────────────────────────
  const handleAnotherExpense = () => {
    setExpenseTypeId(''); setDescription(''); setAmount('')
    setPayMethod('efectivo'); setUserId('')
    setStep('expense')
  }

  // ── Iniciar cierre (carga stats + settings, va a close-session) ───────────
  const handleInitCloseSession = async () => {
    if (!session || !branchId) { onClose(); return }
    setStep('loading')
    try {
      const [sessionRes, settingsRes] = await Promise.all([
        fetch(`/api/pos/sessions?branch_id=${branchId}`).then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
      ])
      const full: PosSessionFull = sessionRes.session
      if (!full) { toast.error('No se encontró la sesión activa'); onClose(); return }
      setClosingSessionFull(full)
      setClosingBizSettings({
        business_name:           settingsRes.business_name           ?? null,
        whatsapp_report_number:  settingsRes.whatsapp_report_number  ?? null,
        business_logo:           settingsRes.business_logo           ?? null,
        receipt_phone:           settingsRes.receipt_phone           ?? null,
        receipt_address:         settingsRes.receipt_address         ?? null,
        receipt_footer:          settingsRes.receipt_footer          ?? null,
        receipt_no_invoice_text: settingsRes.receipt_no_invoice_text ?? null,
      })
      setClosingUserName(getSession()?.name ?? null)
      setStep('close-session')
    } catch {
      toast.error('Error al cargar datos de sesión')
      setStep('saved')
    }
  }

  // ── Confirmar cierre ──────────────────────────────────────────────────────
  const handleConfirmClose = async (closing: number, notes: string) => {
    if (!session) return
    const res = await fetch(`/api/pos/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closing_balance: closing, notes }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    toast.success('Sesión de caja cerrada')
    onClose()
  }

  // ── Render por step ───────────────────────────────────────────────────────
  const branchName = branches.find(b => b.id === branchId)?.name ?? ''

  const content = () => {
    // LOADING
    if (step === 'loading') return (
      <div className="flex items-center justify-center py-14 gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Verificando sesión…
      </div>
    )

    // BRANCH
    if (step === 'branch') return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-gray-500">Seleccioná la sucursal donde registrar el gasto:</p>
        <div className="space-y-2">
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => { setBranchId(b.id); checkSession(b.id) }}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200
                         hover:border-violet-300 hover:bg-violet-50/30 transition-all text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{b.name}</span>
                {b.is_default && (
                  <span className="text-[10px] text-amber-600 bg-amber-100 rounded px-1.5 py-0.5 font-medium">
                    favorita
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>
      </div>
    )

    // SESSION
    if (step === 'session') return (
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Clock className="h-4 w-4 shrink-0" />
          No hay caja abierta en <strong>{branchName}</strong>.
        </div>

        {recentSessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Sesiones recientes
            </p>
            {recentSessions.map(s => (
              <button
                key={s.id}
                onClick={() => { setSession(s); setStep('expense') }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200
                           hover:border-violet-300 hover:bg-violet-50/30 transition-all text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">Sesión #{s.id}</p>
                  <p className="text-xs text-gray-400">
                    {fmtDateTime(s.opened_at)}
                    {s.closed_at ? ` → ${fmtDateTime(s.closed_at)}` : ' · abierta'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nueva sesión</p>
          <button
            onClick={() => setStep('open-balance')}
            className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-violet-200
                       hover:border-violet-400 hover:bg-violet-50/30 transition-all text-left"
          >
            <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-violet-700">Crear nueva sesión de caja</p>
              <p className="text-xs text-violet-400">Recomendado si el gasto es en efectivo</p>
            </div>
          </button>
        </div>
      </div>
    )

    // OPEN-BALANCE
    if (step === 'open-balance') return (
      <OpenSessionContent
        branchName={branchName}
        onConfirm={handleCreateSession}
        onCancel={() => setStep('session')}
      />
    )

    // EXPENSE FORM
    if (step === 'expense') return (
      <div className="space-y-3 py-1">
        {/* Info sesión activa */}
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border">
          <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />
          <span>Sesión #{session?.id} · {branchName}</span>
          {sessionCreated && (
            <Badge variant="outline" className="ml-auto text-[10px] border-violet-200 text-violet-600">
              nueva
            </Badge>
          )}
        </div>

        {/* Tipo */}
        <div className="space-y-1.5">
          <Label>Tipo de gasto</Label>
          <Select value={expenseTypeId} onValueChange={setExpenseTypeId}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Seleccioná un tipo…" /></SelectTrigger>
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
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Ej: Pago cuota seguro" className="text-sm"
          />
        </div>

        {/* Monto */}
        <div className="space-y-1.5">
          <Label>Monto ($) <span className="text-red-500">*</span></Label>
          <Input
            type="number" min={0} step="0.01"
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0" className="text-sm" autoFocus
          />
        </div>

        {/* Forma de pago */}
        <div className="space-y-1.5">
          <Label>Forma de pago</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {PAY_METHODS.map(pm => (
              <button
                key={pm.value} type="button"
                onClick={() => setPayMethod(pm.value)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all
                  ${payMethod === pm.value
                    ? pm.color + ' ring-1 ring-offset-1 ring-current'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
              >
                {pm.icon}{pm.label}
              </button>
            ))}
          </div>
        </div>

        {/* Usuario */}
        <div className="space-y-1.5">
          <Label>Registrado por</Label>
          <Select
            value={userId || '__none__'}
            onValueChange={v => setUserId(v === '__none__' ? '' : v)}
          >
            <SelectTrigger className="text-sm"><SelectValue placeholder="Seleccioná usuario…" /></SelectTrigger>
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

        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSaveExpense} disabled={saving} className="flex-1 gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar gasto
          </Button>
        </div>
      </div>
    )

    // SAVED
    if (step === 'saved') return (
      <div className="space-y-4 py-2">
        <div className="flex flex-col items-center gap-2 py-5">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-xl font-bold text-gray-800">{fmt(savedAmount)}</p>
          <p className="text-sm text-gray-500">Gasto registrado correctamente</p>
        </div>

        <div className="space-y-2">
          <Button onClick={handleAnotherExpense} variant="outline" className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Registrar otro gasto
          </Button>

          {sessionCreated && (
            <Button
              onClick={handleInitCloseSession}
              variant="outline"
              className="w-full gap-2 text-amber-700 border-amber-200 hover:bg-amber-50"
            >
              <Clock className="h-4 w-4" />
              Cerrar sesión de caja
            </Button>
          )}

          <Button onClick={onClose} variant="ghost" className="w-full text-gray-500">
            Cerrar
          </Button>
        </div>
      </div>
    )

    // CLOSE-SESSION
    if (step === 'close-session' && closingSessionFull && closingBizSettings) return (
      <CloseSessionContent
        session={closingSessionFull}
        businessSettings={closingBizSettings}
        closingUserName={closingUserName}
        onConfirm={handleConfirmClose}
        onCancel={() => setStep('saved')}
      />
    )

    return null
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className={
        step === 'close-session'
          ? "sm:max-w-md max-h-[90vh] overflow-y-auto"
          : "sm:max-w-sm"
      }>
        <DialogHeader>
          {step === 'open-balance' || step === 'close-session' ? (
            <DialogTitle />
          ) : (
            <DialogTitle className="flex items-center gap-2">
              <span className="text-lg">💸</span>
              {STEP_TITLES[step]}
            </DialogTitle>
          )}
        </DialogHeader>
        {content()}
      </DialogContent>
    </Dialog>
  )
}
