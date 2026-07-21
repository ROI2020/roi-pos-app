"use client"

import { useState } from "react"
import { Loader2, Lock, Unlock } from "lucide-react"
import { Button }         from "@/components/ui/button"
import { Input }          from "@/components/ui/input"
import { Label }          from "@/components/ui/label"
import { DialogFooter }   from "@/components/ui/dialog"

// ── Tipos compartidos ─────────────────────────────────────────────────────────
export interface PosSessionFull {
  id:                    number
  branch_id:             number
  opened_at:             string
  closed_at:             string | null
  opening_balance:       number
  closing_balance:       number | null
  opened_by_user_id:     number | null
  branch_name:           string | null
  opened_by_user_name:   string | null
  closed_by_user_name:   string | null
  sales_count:           number
  sales_total:           number
  cash_total:            number
  debit_total:           number
  credit_total:          number
  mp_total:              number
  transfer_total:        number
  sales_by_user:         { user_id: number | null; user_name: string; sales_count: number; sales_total: number }[] | null
  expense_count:         number
  expense_total:         number
  expense_cash_total:    number
  expense_debit_total:   number
  expense_credit_total:  number
  expense_mp_total:      number
  expense_transfer_total: number
  withdrawal_total:      number
}

export interface BusinessSettings {
  business_name:          string | null
  whatsapp_report_number: string | null
  business_logo:          string | null
  receipt_phone:          string | null
  receipt_address:        string | null
  receipt_footer:         string | null
  receipt_no_invoice_text: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const fmtArs = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

export const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function Row({ label, value, unit = '', small }: { label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <div className={`flex justify-between ${small ? 'text-xs text-gray-500' : 'text-sm text-gray-700'}`}>
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value}{unit}</span>
    </div>
  )
}

export function buildWhatsAppText(
  session:         PosSessionFull,
  businessName:    string,
  closingUserName: string | null,
  closingTime:     Date,
  closing:         string,
  expectedCash:    number,
): string {
  const fmt    = (n: number) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
    `Saldo inicial: ${fmt(Number(session.opening_balance))}`,
    '',
    `*CIERRE*`,
    `Hora: ${fmtHour(closingTime)}`,
    closingUserName ? `Usuario: ${closingUserName}` : '',
    '',
    `━━━━━━━━━━━━━━━`,
    `*VENTAS DEL TURNO*`,
    `━━━━━━━━━━━━━━━`,
    `Cantidad: ${session.sales_count} venta${session.sales_count !== 1 ? 's' : ''}`,
    `Total: ${fmt(session.sales_total)}`,
    session.cash_total     > 0 ? `Efectivo: ${fmt(session.cash_total)}`         : '',
    session.debit_total    > 0 ? `Debito: ${fmt(session.debit_total)}`          : '',
    session.credit_total   > 0 ? `Credito: ${fmt(session.credit_total)}`        : '',
    session.mp_total       > 0 ? `Mercado Pago: ${fmt(session.mp_total)}`       : '',
    session.transfer_total > 0 ? `Transferencia: ${fmt(session.transfer_total)}` : '',
    ...(session.sales_by_user && session.sales_by_user.length > 1 ? [
      '',
      `*Por vendedora:*`,
      ...session.sales_by_user.map(u =>
        `${u.user_name}: ${fmt(u.sales_total)} (${u.sales_count} venta${u.sales_count !== 1 ? 's' : ''})`
      ),
    ] : []),
    ...(session.expense_count > 0 ? [
      '',
      `━━━━━━━━━━━━━━━`,
      `*GASTOS DEL TURNO*`,
      `━━━━━━━━━━━━━━━`,
      `Total: ${fmt(session.expense_total)} (${session.expense_count} gasto${session.expense_count !== 1 ? 's' : ''})`,
      session.expense_cash_total     > 0 ? `Efectivo: ${fmt(session.expense_cash_total)}`         : '',
      session.expense_debit_total    > 0 ? `Debito: ${fmt(session.expense_debit_total)}`          : '',
      session.expense_credit_total   > 0 ? `Credito: ${fmt(session.expense_credit_total)}`        : '',
      session.expense_mp_total       > 0 ? `Mercado Pago: ${fmt(session.expense_mp_total)}`       : '',
      session.expense_transfer_total > 0 ? `Transferencia: ${fmt(session.expense_transfer_total)}` : '',
    ] : []),
    '',
    `━━━━━━━━━━━━━━━`,
    `*EFECTIVO EN CAJA*`,
    `━━━━━━━━━━━━━━━`,
    `Saldo inicial: ${fmt(Number(session.opening_balance))}`,
    `+ Ventas efectivo: ${fmt(session.cash_total)}`,
    session.expense_cash_total > 0 ? `- Gastos efectivo: ${fmt(session.expense_cash_total)}` : '',
    Number(session.withdrawal_total) > 0 ? `- Retiros Caja Central: ${fmt(Number(session.withdrawal_total))}` : '',
    `= Esperado: ${fmt(expectedCash)}`,
    hasCounted ? `Contado: ${fmt(counted)}` : '',
    hasCounted ? `Diferencia: ${diff >= 0 ? '+' : ''}${fmt(diff)}` : '',
    '',
    `_Enviado desde ROI POS_`,
  ]

  return lines.filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
}

// ── OpenSessionContent ────────────────────────────────────────────────────────
// Contenido del paso "Abrir caja". Se puede usar inline (como step de un dialog)
// o envolverlo en su propio <Dialog> desde pos-terminal.
export function OpenSessionContent({
  branchName,
  onConfirm,
  onCancel,
}: {
  branchName: string
  onConfirm:  (balance: number) => Promise<void>
  onCancel:   () => void
}) {
  const [balance, setBalance] = useState('')
  const [saving,  setSaving ] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    await onConfirm(parseFloat(balance) || 0)
    setSaving(false)
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Unlock className="h-5 w-5 text-green-600" />
        <span className="font-semibold text-gray-800">Abrir Caja — {branchName}</span>
      </div>
      <div className="space-y-3 py-2">
        <Label>Saldo inicial en caja ($)</Label>
        <Input
          autoFocus type="number" min={0} placeholder="0"
          value={balance} onChange={e => setBalance(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !saving && handleConfirm()}
        />
        <p className="text-xs text-gray-400">
          Contá el efectivo disponible antes de empezar.
        </p>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleConfirm} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Abrir caja
        </Button>
      </DialogFooter>
    </>
  )
}

// ── CloseSessionContent ───────────────────────────────────────────────────────
// Contenido del paso "Cerrar caja". Se puede usar inline o en su propio Dialog.
export function CloseSessionContent({
  session,
  businessSettings,
  closingUserName,
  onConfirm,
  onCancel,
}: {
  session:          PosSessionFull
  businessSettings: BusinessSettings
  closingUserName:  string | null
  onConfirm:        (closing: number, notes: string) => Promise<void>
  onCancel:         () => void
}) {
  const [closing,  setClosing] = useState('')
  const [notes,    setNotes  ] = useState('')
  const [saving,   setSaving ] = useState(false)
  const [closingTime] = useState(() => new Date())

  const expectedCash =
    Number(session.opening_balance) +
    Number(session.cash_total) -
    Number(session.expense_cash_total) -
    Number(session.withdrawal_total)

  const difference     = (parseFloat(closing) || 0) - expectedCash
  const hasExpenses    = session.expense_count > 0
  const hasWithdrawals = Number(session.withdrawal_total) > 0

  const businessName = businessSettings.business_name ?? 'ROI POS'
  const waNumber     = businessSettings.whatsapp_report_number

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })

  const handleWhatsApp = () => {
    const text   = buildWhatsAppText(session, businessName, closingUserName, closingTime, closing, expectedCash)
    const number = waNumber!.replace(/\D/g, '')
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-red-500" />
        <span className="font-semibold text-gray-800">Cerrar Caja</span>
      </div>

      {/* Encabezado */}
      <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 space-y-0.5">
        <p className="font-bold text-gray-900 text-base">{businessName}</p>
        {session.branch_name && <p className="text-sm text-gray-600">📍 {session.branch_name}</p>}
        <p className="text-xs text-gray-400 capitalize">{fmtDate(closingTime)}</p>
      </div>

      {/* Apertura / Cierre */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Apertura</p>
          <p className="font-medium text-gray-800">{fmtTime(session.opened_at)} hs</p>
          {session.opened_by_user_name && (
            <p className="text-xs text-gray-500">👤 {session.opened_by_user_name}</p>
          )}
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Cierre</p>
          <p className="font-medium text-gray-800">
            {String(closingTime.getHours()).padStart(2, '0')}:{String(closingTime.getMinutes()).padStart(2, '0')} hs
          </p>
          {closingUserName && <p className="text-xs text-gray-500">👤 {closingUserName}</p>}
        </div>
      </div>

      {/* Ventas */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
        <p className="font-semibold text-gray-700 mb-1.5">Ventas del turno</p>
        <Row label="Cantidad" value={`${session.sales_count} venta${session.sales_count !== 1 ? 's' : ''}`} />
        <Row label="Total vendido" value={fmtArs(session.sales_total)} />
        {(session.cash_total > 0 || session.debit_total > 0 || session.credit_total > 0 ||
          session.mp_total > 0 || session.transfer_total > 0) && (
          <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
            {session.cash_total     > 0 && <Row label="↳ Efectivo"      value={fmtArs(session.cash_total)}     small />}
            {session.debit_total    > 0 && <Row label="↳ Débito"        value={fmtArs(session.debit_total)}    small />}
            {session.credit_total   > 0 && <Row label="↳ Crédito"       value={fmtArs(session.credit_total)}   small />}
            {session.mp_total       > 0 && <Row label="↳ Mercado Pago"  value={fmtArs(session.mp_total)}       small />}
            {session.transfer_total > 0 && <Row label="↳ Transferencia" value={fmtArs(session.transfer_total)} small />}
          </div>
        )}
        {session.sales_by_user && session.sales_by_user.length > 0 && (
          <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Por vendedora</p>
            {session.sales_by_user.map(u => (
              <div key={u.user_id ?? 'sin'} className="flex justify-between text-xs text-gray-500">
                <span>{u.user_name}</span>
                <span className="font-medium tabular-nums">
                  {fmtArs(u.sales_total)}
                  <span className="text-gray-400 ml-1">({u.sales_count} venta{u.sales_count !== 1 ? 's' : ''})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gastos */}
      {hasExpenses && (
        <div className="bg-amber-50 rounded-xl p-3 space-y-1.5 text-sm border border-amber-100">
          <p className="font-semibold text-amber-800 mb-1.5">
            Gastos del turno
            <span className="ml-1.5 text-xs font-normal text-amber-600">
              ({session.expense_count} gasto{session.expense_count !== 1 ? 's' : ''})
            </span>
          </p>
          <Row label="Total gastos" value={fmtArs(session.expense_total)} />
          <div className="border-t border-amber-200 pt-1.5 mt-1 space-y-1">
            {session.expense_cash_total     > 0 && <Row label="↳ Efectivo"      value={fmtArs(session.expense_cash_total)}     small />}
            {session.expense_debit_total    > 0 && <Row label="↳ Débito"        value={fmtArs(session.expense_debit_total)}    small />}
            {session.expense_credit_total   > 0 && <Row label="↳ Crédito"       value={fmtArs(session.expense_credit_total)}   small />}
            {session.expense_mp_total       > 0 && <Row label="↳ Mercado Pago"  value={fmtArs(session.expense_mp_total)}       small />}
            {session.expense_transfer_total > 0 && <Row label="↳ Transferencia" value={fmtArs(session.expense_transfer_total)} small />}
          </div>
        </div>
      )}

      {/* Efectivo en caja */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
        <p className="font-semibold text-gray-700 mb-1.5">Efectivo en caja</p>
        <Row label="Saldo inicial"      value={fmtArs(Number(session.opening_balance))} small />
        <Row label="+ Ventas efectivo"  value={fmtArs(session.cash_total)}              small />
        {session.expense_cash_total > 0 &&
          <Row label="− Gastos efectivo" value={fmtArs(session.expense_cash_total)}     small />
        }
        {hasWithdrawals &&
          <Row label="− Retiros Caja Central" value={fmtArs(Number(session.withdrawal_total))} small />
        }
        <div className="border-t border-gray-200 pt-1.5 mt-0.5">
          <Row label="Efectivo esperado" value={fmtArs(expectedCash)} />
        </div>
      </div>

      {/* Conteo + Notas */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Efectivo contado en caja ($)</Label>
          <Input
            autoFocus type="number" min={0} placeholder="0"
            value={closing} onChange={e => setClosing(e.target.value)}
          />
          {closing !== '' && (
            <p className={`text-xs font-medium ${difference >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              Diferencia: {difference >= 0 ? '+' : ''}{fmtArs(difference)}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Notas (opcional)</Label>
          <Input placeholder="Observaciones del turno…" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" onClick={onCancel} className="mr-auto">Cancelar</Button>

        {waNumber && (
          <Button
            variant="outline"
            onClick={handleWhatsApp}
            className="gap-2 border-green-400 text-green-700 hover:bg-green-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Enviar por WhatsApp
          </Button>
        )}

        <Button
          variant="destructive"
          onClick={async () => {
            setSaving(true)
            await onConfirm(parseFloat(closing) || 0, notes)
            setSaving(false)
          }}
          disabled={saving}
          className="gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Cerrar caja
        </Button>
      </DialogFooter>
    </div>
  )
}
