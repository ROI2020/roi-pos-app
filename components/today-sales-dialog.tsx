"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Loader2, Printer, ReceiptText, RefreshCw, ChevronDown, ChevronRight,
  Banknote, CreditCard, Smartphone, ArrowDownUp, User,
  FileCheck, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge }  from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { ReceiptDialog, type ReceiptData, type ReceiptSettings } from "@/components/receipt-dialog"
import { useFacturacion } from "@/hooks/useFacturacion"
import type { FacturacionOutput } from "@/lib/facturacion/types"

// ── Types ──────────────────────────────────────────────────────────────────────
interface SaleItem {
  id: number
  variant_id: number
  sku: string
  product_name: string
  color: string
  size: string
  unit_price: number
  base_price: number
}

interface Sale {
  id: number
  invoice_number: string | null
  sold_at: string
  subtotal: number
  discount_amount: number
  total_amount: number
  payment_method: string
  notes: string | null
  user_id: number | null
  user_name: string | null
  arca_cae: string | null
  factura_id: string | null
  items: SaleItem[]
}

interface Props {
  open:          boolean
  onClose:       () => void
  branchId:      number
  settings:      ReceiptSettings
  cuitEmisor?:   string   // si está presente, habilita facturación inline
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const PAY_ICONS: Record<string, React.ReactNode> = {
  efectivo:      <Banknote    className="h-3.5 w-3.5" />,
  debito:        <CreditCard  className="h-3.5 w-3.5" />,
  credito:       <CreditCard  className="h-3.5 w-3.5" />,
  mp:            <Smartphone  className="h-3.5 w-3.5" />,
  transferencia: <ArrowDownUp className="h-3.5 w-3.5" />,
}

const PAY_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  debito:        'Débito',
  credito:       'Crédito',
  mp:            'Mercado Pago',
  transferencia: 'Transferencia',
}

const PAY_COLORS: Record<string, string> = {
  efectivo:      'border-green-300  text-green-700  bg-green-50',
  debito:        'border-emerald-300 text-emerald-700 bg-emerald-50',
  credito:       'border-violet-300 text-violet-700 bg-violet-50',
  mp:            'border-sky-300    text-sky-700    bg-sky-50',
  transferencia: 'border-amber-300  text-amber-700  bg-amber-50',
}

// ── Botón de facturación inline por venta ──────────────────────────────────────
function FacturarSaleButton({
  saleId,
  cuitEmisor,
  onEmitida,
}: {
  saleId: number
  cuitEmisor: string
  onEmitida: (output: FacturacionOutput) => void
}) {
  const { cargando, exitoso, fallido, error, resultado, facturar } = useFacturacion({
    ventaId: String(saleId),
    cuitEmisor,
    onSuccess: onEmitida,
  })

  if (exitoso && resultado) {
    return (
      <a
        href={resultado.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`CAE: ${resultado.cae}`}
        className="flex items-center"
        onClick={e => e.stopPropagation()}
      >
        <FileCheck className="h-3.5 w-3.5 text-green-600" />
      </a>
    )
  }

  if (fallido && error) {
    return (
      <button
        title={`Error: ${error.mensaje}. Clic para reintentar`}
        className="flex items-center"
        onClick={e => { e.stopPropagation(); facturar() }}
      >
        <FileText className="h-3.5 w-3.5 text-red-400" />
      </button>
    )
  }

  return (
    <Button
      size="icon" variant="ghost"
      className="h-7 w-7 shrink-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
      title="Emitir factura B"
      disabled={cargando}
      onClick={e => { e.stopPropagation(); facturar() }}
    >
      {cargando
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <FileText className="h-3.5 w-3.5" />
      }
    </Button>
  )
}

// ── Componente ─────────────────────────────────────────────────────────────────
export function TodaySalesDialog({ open, onClose, branchId, settings, cuitEmisor }: Props) {
  const [sales,       setSales      ] = useState<Sale[]>([])
  const [loading,     setLoading    ] = useState(false)
  const [expandedId,  setExpandedId ] = useState<number | null>(null)
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  // Output de facturación obtenido inline, por sale.id
  const [facturaLocal, setFacturaLocal] = useState<Record<number, FacturacionOutput>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch(`/api/sales/today?branch_id=${branchId}`).then(r => r.json())
      setSales(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    finally  { setLoading(false) }
  }, [branchId])

  useEffect(() => { if (open) load() }, [open, load])

  const openReprint = (sale: Sale) => {
    setReceiptData({
      items:          sale.items,
      subtotal:       sale.subtotal,
      discountAmount: sale.discount_amount,
      discountValue:  sale.discount_amount > 0
        ? String(Math.round(sale.discount_amount / sale.subtotal * 100))
        : '0',
      discountType:   'pct',
      total:          sale.total_amount,
      payMethodLabel: PAY_LABELS[sale.payment_method] ?? sale.payment_method,
      invoiceNum:     sale.invoice_number ?? '',
      saleId:         sale.id,
      branchId,
    })
  }

  // ── Totales generales ──────────────────────────────────────────────────────
  const totals = sales.reduce(
    (acc, s) => {
      acc.count++
      acc.total += s.total_amount
      acc[s.payment_method as keyof typeof acc] =
        ((acc[s.payment_method as keyof typeof acc] as number) || 0) + s.total_amount
      return acc
    },
    { count: 0, total: 0, efectivo: 0, debito: 0, credito: 0, mp: 0, transferencia: 0 }
  )

  // ── Totales por vendedor ───────────────────────────────────────────────────
  const byUser = sales.reduce<Record<string, { name: string; count: number; total: number; sales: Sale[] }>>(
    (acc, s) => {
      const key  = String(s.user_id ?? 'sin_usuario')
      const name = s.user_name?.split(' ')[0] ?? 'Sin usuario'
      if (!acc[key]) acc[key] = { name, count: 0, total: 0, sales: [] }
      acc[key].count++
      acc[key].total += s.total_amount
      acc[key].sales.push(s)
      return acc
    }, {}
  )
  const userGroups = Object.entries(byUser)
    .map(([key, grp]) => ({ key, ...grp }))
    .sort((a, b) => b.total - a.total)

  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  // Si hay un solo vendedor, expandirlo por defecto al cargar
  useEffect(() => {
    if (userGroups.length === 1) setExpandedUser(userGroups[0].key)
  }, [sales]) // eslint-disable-line

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-violet-600" />
              Ventas del día
              <Badge variant="outline" className="ml-1 text-xs font-normal">
                {new Date().toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Badge>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 ml-auto text-gray-400 hover:text-gray-600"
                onClick={load}
                disabled={loading}
                title="Actualizar"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {/* ── Resumen general ── */}
          {!loading && sales.length > 0 && (
            <div className="shrink-0 grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm">
              <div>
                <p className="text-xs text-gray-400">Ventas</p>
                <p className="font-bold text-gray-800">{totals.count}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total recaudado</p>
                <p className="font-bold text-gray-800">{fmt(totals.total)}</p>
              </div>
              {(['efectivo','debito','credito','mp','transferencia'] as const).map(m => {
                const v = totals[m] as number
                if (!v) return null
                return (
                  <div key={m} className="flex items-center gap-1.5">
                    <span className="text-gray-400">{PAY_ICONS[m]}</span>
                    <div>
                      <p className="text-[10px] text-gray-400 leading-none">{PAY_LABELS[m]}</p>
                      <p className="text-sm font-medium">{fmt(v)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Lista agrupada por vendedor ── */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 py-1">

            {loading && (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-10">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando ventas…</span>
              </div>
            )}

            {!loading && sales.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 text-gray-300 py-10">
                <ReceiptText className="h-10 w-10" />
                <p className="text-sm text-gray-400">No hay ventas registradas hoy</p>
              </div>
            )}

            {!loading && userGroups.map(group => {
              const isUserExpanded = expandedUser === group.key
              return (
                <div key={group.key} className="border border-gray-200 rounded-xl overflow-hidden">

                  {/* Cabecera del vendedor */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 border-b border-violet-100 cursor-pointer hover:bg-violet-100"
                    onClick={() => setExpandedUser(isUserExpanded ? null : group.key)}
                  >
                    {isUserExpanded
                      ? <ChevronDown  className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    }
                    <User className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    <span className="font-semibold text-sm text-violet-800 flex-1">{group.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {group.count} venta{group.count !== 1 ? 's' : ''}
                    </span>
                    <span className="font-bold text-sm text-violet-700 shrink-0 ml-2">
                      {fmt(group.total)}
                    </span>
                  </div>

                  {/* Ventas del vendedor (expandidas) */}
                  {isUserExpanded && (
                    <div className="space-y-1 p-1.5">
                      {group.sales.map(sale => {
                        const receiptId = sale.invoice_number || `${branchId}-${sale.id}`
                        const expanded  = expandedId === sale.id

                        return (
                          <div key={sale.id} className="border border-gray-100 rounded-lg overflow-hidden">

                            {/* Fila principal */}
                            <div
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                              onClick={() => setExpandedId(expanded ? null : sale.id)}
                            >
                              {expanded
                                ? <ChevronDown  className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              }

                              <span className="text-xs text-gray-400 w-10 shrink-0">{fmtTime(sale.sold_at)}</span>

                              <span className="text-xs font-mono text-gray-600 shrink-0">#{receiptId}</span>

                              <Badge
                                variant="outline"
                                className={`text-[10px] gap-1 shrink-0 ${PAY_COLORS[sale.payment_method] ?? ''}`}
                              >
                                {PAY_ICONS[sale.payment_method]}
                                {PAY_LABELS[sale.payment_method] ?? sale.payment_method}
                              </Badge>

                              <span className="text-xs text-gray-400 shrink-0">
                                {sale.items.length} prenda{sale.items.length !== 1 ? 's' : ''}
                              </span>

                              <span className="ml-auto font-semibold text-sm text-gray-800 shrink-0">
                                {fmt(sale.total_amount)}
                              </span>

                              <Button
                                size="icon" variant="ghost"
                                className="h-7 w-7 shrink-0 text-violet-500 hover:text-violet-700 hover:bg-violet-50"
                                title="Reimprimir recibo"
                                onClick={e => { e.stopPropagation(); openReprint(sale) }}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>

                              {/* Indicador / botón de facturación ARCA */}
                              {(() => {
                                const facturaEmitida = facturaLocal[sale.id]
                                const yaFacturada    = !!sale.arca_cae || !!facturaEmitida

                                if (yaFacturada) {
                                  const pdfUrl    = facturaEmitida?.pdfUrl
                                  // factura_id viene de la DB; si se acaba de emitir, lo extraemos del pdfUrl
                                  const facturaId = sale.factura_id
                                    ?? pdfUrl?.split('/').at(-1)
                                  const ticketUrl = facturaId
                                    ? `/api/facturacion/pdf/${facturaId}?formato=ticket`
                                    : null

                                  return (
                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                      <a
                                        href={pdfUrl ?? '#'}
                                        target={pdfUrl ? '_blank' : undefined}
                                        rel="noopener noreferrer"
                                        title={`Factura emitida — CAE: ${facturaEmitida?.cae ?? sale.arca_cae}`}
                                        className="flex items-center"
                                        onClick={e => { if (!pdfUrl) e.preventDefault() }}
                                      >
                                        <FileCheck className="h-3.5 w-3.5 text-green-600" />
                                      </a>
                                      {ticketUrl && (
                                        <a
                                          href={ticketUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="Imprimir ticket 80mm"
                                          className="flex items-center"
                                        >
                                          <Printer className="h-3.5 w-3.5 text-violet-500" />
                                        </a>
                                      )}
                                    </div>
                                  )
                                }
                                if (cuitEmisor) {
                                  return (
                                    <FacturarSaleButton
                                      saleId={sale.id}
                                      cuitEmisor={cuitEmisor}
                                      onEmitida={output => {
                                        setFacturaLocal(prev => ({ ...prev, [sale.id]: output }))
                                      }}
                                    />
                                  )
                                }
                                return null
                              })()}
                            </div>

                            {/* Detalle expandido */}
                            {expanded && (
                              <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 space-y-1.5">
                                {sale.items.map(item => (
                                  <div key={item.variant_id} className="flex justify-between items-start text-xs">
                                    <div>
                                      <span className="font-medium text-gray-700">1x {item.product_name}</span>
                                      <span className="text-gray-400 ml-1">{item.color} · T.{item.size}</span>
                                      <span className="font-mono text-gray-300 ml-1.5">SKU: {item.sku}</span>
                                    </div>
                                    <span className="font-medium text-gray-700 shrink-0 ml-3">{fmt(item.unit_price)}</span>
                                  </div>
                                ))}

                                {(sale.discount_amount > 0 || sale.subtotal !== sale.total_amount) && (
                                  <div className="border-t border-gray-200 pt-1.5 space-y-0.5">
                                    <div className="flex justify-between text-[11px] text-gray-500">
                                      <span>Subtotal</span><span>{fmt(sale.subtotal)}</span>
                                    </div>
                                    {sale.discount_amount > 0 && (
                                      <div className="flex justify-between text-[11px] text-orange-600">
                                        <span>Descuento</span><span>−{fmt(sale.discount_amount)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between text-xs font-bold text-gray-700">
                                      <span>Total</span><span>{fmt(sale.total_amount)}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {receiptData && (
        <ReceiptDialog
          open={!!receiptData}
          onClose={() => setReceiptData(null)}
          data={receiptData}
          settings={settings}
        />
      )}
    </>
  )
}
