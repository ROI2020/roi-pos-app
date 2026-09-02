"use client"

import { useState, useEffect, useCallback, useMemo, Fragment } from "react"
import {
  Loader2, Printer, ChevronDown, ChevronRight, Search,
  Banknote, CreditCard, Smartphone, ArrowDownUp, RefreshCw,
  FileText, FileCheck,
} from "lucide-react"
import { Input }  from "@/components/ui/input"
import { Badge }  from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ReceiptDialog, type ReceiptData, type ReceiptSettings } from "@/components/receipt-dialog"
import { useAdminCurrency } from "@/hooks/use-admin-currency"
import { useFacturacion } from "@/hooks/useFacturacion"
import type { FacturacionOutput } from "@/lib/facturacion/types"

// ── Types ──────────────────────────────────────────────────────────────────────
interface SaleItem {
  id: number; variant_id: number; sku: string; product_name: string
  color: string; size: string; unit_price: number; base_price: number
}

interface SaleRow {
  type:              'venta' | 'cambio'
  id:                number
  sale_id:           number
  invoice_number:    string | null
  arca_cae:          string | null
  factura_id:        string | null
  puede_facturar:    boolean
  cuit_emisor:       string | null
  sold_at:           string
  subtotal:          number
  discount_amount:   number
  total_amount:      number
  payment_method:    string
  payment_split:     Record<string, number> | null
  notes:             string | null
  branch_id:         number
  branch_name:       string
  user_id:           number | null
  user_name:         string | null
  swap_description:  string | null
  items:             SaleItem[]
}

interface Props {
  fromYMD: string
  toYMD:   string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const PAY_ICONS: Record<string, React.ReactNode> = {
  efectivo:      <Banknote    className="h-3 w-3" />,
  debito:        <CreditCard  className="h-3 w-3" />,
  credito:       <CreditCard  className="h-3 w-3" />,
  mp:            <Smartphone  className="h-3 w-3" />,
  transferencia: <ArrowDownUp className="h-3 w-3" />,
}
const PAY_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', mp: 'Mercado Pago',
  transferencia: 'Transferencia', cambio: 'Cambio',
}
const PAY_COLORS: Record<string, string> = {
  efectivo:      'border-green-300   text-green-700   bg-green-50',
  debito:        'border-emerald-300 text-emerald-700 bg-emerald-50',
  credito:       'border-violet-300  text-violet-700  bg-violet-50',
  mp:            'border-sky-300     text-sky-700     bg-sky-50',
  transferencia: 'border-amber-300   text-amber-700   bg-amber-50',
  cambio:        'border-gray-300    text-gray-600    bg-gray-50',
}

// ── FacturaIcono ───────────────────────────────────────────────────────────────
function FacturaIcono({
  saleId, arcaCae, facturaId, puedeFacturar, invoiceNumber, cuitEmisor, onEmitida, localOutput,
}: {
  saleId: number
  arcaCae: string | null
  facturaId: string | null
  puedeFacturar: boolean
  invoiceNumber: string | null
  cuitEmisor: string | null
  onEmitida: (output: FacturacionOutput) => void
  localOutput?: FacturacionOutput
}) {
  const { cargando, facturar } = useFacturacion({
    ventaId: String(saleId),
    cuitEmisor: cuitEmisor ?? '',
    onSuccess: onEmitida,
  })

  if (arcaCae || localOutput) {
    const pdfHref = localOutput?.pdfUrl ?? (facturaId ? `/api/facturacion/pdf/${facturaId}` : null)
    return (
      <a
        href={pdfHref ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        title={`Factura ${invoiceNumber ?? ''}`}
        onClick={e => { e.stopPropagation(); if (!pdfHref) e.preventDefault() }}
        className="flex items-center justify-center h-7 w-7 shrink-0 rounded text-green-600 hover:bg-green-50"
      >
        <FileCheck className="h-3.5 w-3.5" />
      </a>
    )
  }

  if (puedeFacturar && cuitEmisor) {
    return (
      <Button
        size="icon" variant="ghost"
        className="h-7 w-7 shrink-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
        title="Emitir factura"
        disabled={cargando}
        onClick={e => { e.stopPropagation(); facturar() }}
      >
        {cargando
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <FileText className="h-3.5 w-3.5" />}
      </Button>
    )
  }

  return null
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SalesReportTab({ fromYMD, toYMD }: Props) {
  const { fmt } = useAdminCurrency()

  const [rows,           setRows          ] = useState<SaleRow[]>([])
  const [loading,        setLoading       ] = useState(false)
  const [search,         setSearch        ] = useState('')
  const [expandedGroup,  setExpandedGroup ] = useState<string | null>(null)
  const [expandedSale,   setExpandedSale  ] = useState<number | null>(null)
  const [receiptData,    setReceiptData   ] = useState<ReceiptData | null>(null)
  const [localFacturado, setLocalFacturado] = useState<Record<number, FacturacionOutput>>({})
  const [settings,     setSettings    ] = useState<ReceiptSettings>({
    business_name: null, business_logo: null, receipt_address: null,
    receipt_phone: null, receipt_footer: null, receipt_no_invoice_text: null,
  })

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then((s: Record<string, string | null>) =>
      setSettings({
        business_name:           s.business_name           ?? null,
        business_logo:           s.business_logo           ?? null,
        receipt_address:         s.receipt_address         ?? null,
        receipt_phone:           s.receipt_phone           ?? null,
        receipt_footer:          s.receipt_footer          ?? null,
        receipt_no_invoice_text: s.receipt_no_invoice_text ?? null,
      })
    ).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch(`/api/reports/sales?from=${fromYMD}&to=${toYMD}`).then(r => r.json())
      setRows(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    finally  { setLoading(false) }
  }, [fromYMD, toYMD])

  useEffect(() => { load() }, [load])

  // ── Búsqueda (cualquier columna) ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => {
      const haystack = [
        r.invoice_number, r.branch_name, r.user_name, r.payment_method,
        r.swap_description, r.notes,
        ...r.items.flatMap(i => [i.product_name, i.sku, i.color, i.size]),
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, search])

  // ── Agrupado por Fecha + Sucursal + Vendedor ──────────────────────────────
  type Group = {
    key: string; dateLabel: string; branchName: string; userName: string
    count: number; subtotal: number; discount: number; total: number; rows: SaleRow[]
  }
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const r of filtered) {
      const dateLabel = fmtDate(r.sold_at)
      const userName  = r.user_name ?? 'Sin usuario'
      const key = `${dateLabel}|${r.branch_id}|${r.user_id ?? 'none'}`
      const g = map.get(key) ?? {
        key, dateLabel, branchName: r.branch_name, userName,
        count: 0, subtotal: 0, discount: 0, total: 0, rows: [],
      }
      g.count++
      g.subtotal += r.subtotal
      g.discount += r.discount_amount
      g.total    += r.total_amount
      g.rows.push(r)
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => {
      if (a.dateLabel !== b.dateLabel) {
        const [da,ma,ya] = a.dateLabel.split('/').map(Number)
        const [db,mb,yb] = b.dateLabel.split('/').map(Number)
        return new Date(yb,mb-1,db).getTime() - new Date(ya,ma-1,da).getTime()
      }
      if (a.branchName !== b.branchName) return a.branchName.localeCompare(b.branchName)
      return a.userName.localeCompare(b.userName)
    })
  }, [filtered])

  const grandTotal = useMemo(() => ({
    count:    groups.reduce((s,g) => s + g.count,    0),
    subtotal: groups.reduce((s,g) => s + g.subtotal, 0),
    discount: groups.reduce((s,g) => s + g.discount, 0),
    total:    groups.reduce((s,g) => s + g.total,    0),
  }), [groups])

  const openReceipt = (r: SaleRow) => {
    setReceiptData({
      items:          r.items,
      subtotal:       r.subtotal,
      discountAmount: r.discount_amount,
      discountValue:  r.discount_amount > 0
        ? String(Math.round(r.discount_amount / r.subtotal * 100))
        : '0',
      discountType:   'pct',
      total:          r.total_amount,
      payMethodLabel: r.payment_split ? 'Pago combinado' : (PAY_LABELS[r.payment_method] ?? r.payment_method),
      paymentSplit:   r.payment_split ?? undefined,
      invoiceNum:     r.invoice_number ?? '',
      saleId:         r.sale_id,
      branchId:       r.branch_id,
    })
  }

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por vendedor, sucursal, recibo, prenda, SKU…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} venta{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" /> Cargando ventas…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
          <p className="font-medium text-gray-500">Sin ventas en este período</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-2 py-2.5 text-left w-6" />
                <th className="px-3 py-2.5 text-left">Fecha</th>
                <th className="px-3 py-2.5 text-left">Sucursal</th>
                <th className="px-3 py-2.5 text-left">Vendedor</th>
                <th className="px-3 py-2.5 text-right">Cantidad</th>
                <th className="px-3 py-2.5 text-right">Sub Total</th>
                <th className="px-3 py-2.5 text-right">Descuento</th>
                <th className="px-4 py-2.5 text-right">Total Venta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {groups.map(g => {
                const isOpen = expandedGroup === g.key
                return (
                  <Fragment key={g.key}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedGroup(isOpen ? null : g.key)}
                    >
                      <td className="px-2 py-2.5 text-gray-400">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{g.dateLabel}</td>
                      <td className="px-3 py-2.5 text-gray-700">{g.branchName}</td>
                      <td className="px-3 py-2.5 text-gray-700">{g.userName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{g.count}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(g.subtotal)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-orange-600">
                        {g.discount > 0 ? `−${fmt(g.discount)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-800">
                        {fmt(g.total)}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/60 px-4 py-3">
                          <div className="space-y-1.5">
                            {[...g.rows]
                              .sort((a,b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime())
                              .map(r => {
                              const isSaleOpen = expandedSale === r.id
                              const receiptId  = r.invoice_number || `${r.branch_id}-${r.sale_id}`
                              return (
                                <div key={`${r.type}-${r.id}`} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                                  <div
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                    onClick={() => setExpandedSale(isSaleOpen ? null : r.id)}
                                  >
                                    {isSaleOpen
                                      ? <ChevronDown  className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                      : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                                    <span className="text-xs text-gray-400 w-10 shrink-0">{fmtTime(r.sold_at)}</span>
                                    {r.type === 'cambio' && (
                                      <Badge variant="outline" className="text-[10px] gap-1 shrink-0 border-violet-300 text-violet-700 bg-violet-50">
                                        <RefreshCw className="h-3 w-3" /> Cambio
                                      </Badge>
                                    )}
                                    <span className="text-xs font-mono text-gray-600 shrink-0">#{receiptId}</span>
                                    {r.payment_split ? (
                                      <Badge variant="outline" className="text-[10px] gap-1 shrink-0 border-gray-300 text-gray-600 bg-gray-50">
                                        Pago combinado
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className={`text-[10px] gap-1 shrink-0 ${PAY_COLORS[r.payment_method] ?? ''}`}>
                                        {PAY_ICONS[r.payment_method]}
                                        {PAY_LABELS[r.payment_method] ?? r.payment_method}
                                      </Badge>
                                    )}
                                    <span className="text-xs text-gray-400 shrink-0">
                                      {r.items.length} prenda{r.items.length !== 1 ? 's' : ''}
                                    </span>
                                    <span className="ml-auto font-semibold text-sm text-gray-800 shrink-0">
                                      {fmt(r.total_amount)}
                                    </span>
                                    <Button
                                      size="icon" variant="ghost"
                                      className="h-7 w-7 shrink-0 text-violet-500 hover:text-violet-700 hover:bg-violet-50"
                                      title="Ver / reimprimir recibo"
                                      onClick={e => { e.stopPropagation(); openReceipt(r) }}
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                    </Button>
                                    <FacturaIcono
                                      saleId={r.sale_id}
                                      arcaCae={r.arca_cae}
                                      facturaId={r.factura_id}
                                      puedeFacturar={r.puede_facturar}
                                      invoiceNumber={r.invoice_number}
                                      cuitEmisor={r.cuit_emisor}
                                      onEmitida={output => setLocalFacturado(prev => ({ ...prev, [r.sale_id]: output }))}
                                      localOutput={localFacturado[r.sale_id]}
                                    />
                                  </div>

                                  {isSaleOpen && (
                                    <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 space-y-1.5">
                                      {r.swap_description && (
                                        <p className="text-xs text-violet-600 font-medium">{r.swap_description}</p>
                                      )}
                                      {r.items.map(item => (
                                        <div key={item.variant_id} className="flex justify-between items-start text-xs">
                                          <div>
                                            <span className="font-medium text-gray-700">{item.product_name}</span>
                                            <span className="text-gray-400 ml-1">{item.color} · T.{item.size}</span>
                                            <span className="font-mono text-gray-300 ml-1.5">SKU: {item.sku}</span>
                                          </div>
                                          <span className="font-medium text-gray-700 shrink-0 ml-3">{fmt(item.unit_price)}</span>
                                        </div>
                                      ))}
                                      <div className="border-t border-gray-200 pt-1.5 space-y-0.5">
                                        <div className="flex justify-between text-[11px] text-gray-500">
                                          <span>Subtotal</span><span>{fmt(r.subtotal)}</span>
                                        </div>
                                        {r.discount_amount > 0 && (
                                          <div className="flex justify-between text-[11px] text-orange-600">
                                            <span>Descuento</span><span>−{fmt(r.discount_amount)}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between text-xs font-bold text-gray-700">
                                          <span>Total</span><span>{fmt(r.total_amount)}</span>
                                        </div>
                                        {r.payment_split && (
                                          <div className="pt-1 flex flex-wrap gap-1">
                                            {Object.entries(r.payment_split).map(([m, v]) => (
                                              <Badge key={m} variant="outline" className={`text-[10px] gap-1 ${PAY_COLORS[m] ?? ''}`}>
                                                {PAY_ICONS[m]} {PAY_LABELS[m] ?? m}: {fmt(v)}
                                              </Badge>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-100 font-semibold text-sm">
                <td colSpan={4} className="px-4 py-2.5 text-gray-700">TOTAL</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{grandTotal.count}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(grandTotal.subtotal)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-orange-600">
                  {grandTotal.discount > 0 ? `−${fmt(grandTotal.discount)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums">{fmt(grandTotal.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {receiptData && (
        <ReceiptDialog
          open={!!receiptData}
          onClose={() => setReceiptData(null)}
          data={receiptData}
          settings={settings}
        />
      )}
    </div>
  )
}
