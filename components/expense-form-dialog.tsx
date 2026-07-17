"use client"

import { useState, useEffect } from "react"
import {
  Loader2, Banknote, CreditCard, Smartphone, ArrowDownUp,
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

// ── Types ──────────────────────────────────────────────────────────────────────
type PayMethod = 'efectivo' | 'debito' | 'credito' | 'mp' | 'transferencia'

interface ExpenseType { id: number; name: string }
interface AppUser     { id: number; name: string }

export const EXPENSE_PAY_METHODS = [
  { value: 'efectivo'      as PayMethod, label: 'Efectivo',      icon: <Banknote    className="h-4 w-4" />, color: 'border-green-400   text-green-700   bg-green-50'   },
  { value: 'debito'        as PayMethod, label: 'Débito',        icon: <CreditCard  className="h-4 w-4" />, color: 'border-emerald-400 text-emerald-700 bg-emerald-50'  },
  { value: 'credito'       as PayMethod, label: 'Crédito',       icon: <CreditCard  className="h-4 w-4" />, color: 'border-violet-400  text-violet-700  bg-violet-50'  },
  { value: 'mp'            as PayMethod, label: 'Mercado Pago',  icon: <Smartphone  className="h-4 w-4" />, color: 'border-sky-400     text-sky-700     bg-sky-50'     },
  { value: 'transferencia' as PayMethod, label: 'Transferencia', icon: <ArrowDownUp className="h-4 w-4" />, color: 'border-amber-400   text-amber-700   bg-amber-50'   },
]

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

// ── Props ──────────────────────────────────────────────────────────────────────
interface CreateProps {
  mode:        'create'
  sessionId:   number
  branchId:    number
  onClose:     () => void
  onSaved:     () => void
}

interface EditProps {
  mode:        'edit'
  expenseId:   number
  initial: {
    expense_type_id: number | null
    description:     string | null
    amount:          number
    payment_method:  string
    user_id:         number | null
  }
  onClose:     () => void
  onSaved:     () => void
}

type Props = CreateProps | EditProps

// ══════════════════════════════════════════════════════════════════════════════
export default function ExpenseFormDialog(props: Props) {
  const { mode, onClose, onSaved } = props
  const init = mode === 'edit' ? props.initial : null

  const [expenseTypes,  setExpenseTypes ] = useState<ExpenseType[]>([])
  const [users,         setUsers        ] = useState<AppUser[]>([])
  const [expenseTypeId, setExpenseTypeId] = useState(init?.expense_type_id ? String(init.expense_type_id) : '')
  const [description,   setDescription ] = useState(init?.description ?? '')
  const [amount,        setAmount      ] = useState(init?.amount ? String(init.amount) : '')
  const [payMethod,     setPayMethod   ] = useState<PayMethod>((init?.payment_method as PayMethod) ?? 'efectivo')
  const [userId,        setUserId      ] = useState(init?.user_id ? String(init.user_id) : '')
  const [saving,        setSaving      ] = useState(false)

  useEffect(() => {
    fetch('/api/expense-types').then(r => r.json()).then(setExpenseTypes).catch(() => {})
    fetch('/api/users').then(r => r.json()).then(setUsers).catch(() => {})
  }, [])

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { toast.error('Ingresá un monto válido'); return }
    setSaving(true)
    try {
      const common = {
        expense_type_id: expenseTypeId ? parseInt(expenseTypeId) : null,
        description:     description.trim() || null,
        amount:          amt,
        payment_method:  payMethod,
        user_id:         userId && userId !== '__none__' ? parseInt(userId) : null,
      }

      const res = mode === 'create'
        ? await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...common, pos_session_id: props.sessionId, branch_id: props.branchId }),
          })
        : await fetch(`/api/expenses/${props.expenseId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(common),
          })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(mode === 'create' ? `Gasto de ${fmt(amt)} registrado` : 'Gasto actualizado')
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
            {mode === 'create' ? 'Registrar Gasto' : 'Editar Gasto'}
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
              placeholder="0" className="text-sm" autoFocus
            />
          </div>

          {/* Forma de pago */}
          <div className="space-y-1.5">
            <Label>Forma de pago</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {EXPENSE_PAY_METHODS.map(pm => (
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
            {mode === 'create' ? 'Guardar gasto' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
