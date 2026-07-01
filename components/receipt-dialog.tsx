"use client"

import { Printer, Gift, FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { BotonFacturar } from "@/components/facturacion/BotonFacturar"
import type { FacturacionOutput } from "@/lib/facturacion/types"

// ── Types ──────────────────────────────────────────────────────────────────────
interface ReceiptItem {
  id: number
  sku: string
  product_name: string
  color: string
  size: string
  unit_price: number
  base_price: number
}

export interface ReceiptSettings {
  business_name:          string | null
  business_logo:          string | null
  receipt_address:        string | null
  receipt_phone:          string | null
  receipt_footer:         string | null
  receipt_no_invoice_text: string | null
}

export interface ReceiptData {
  items:          ReceiptItem[]
  subtotal:       number
  discountAmount: number
  discountValue:  string
  discountType:   'pct' | 'amt'
  total:          number
  payMethodLabel: string
  paymentSplit?:  Partial<Record<string, number>>
  invoiceNum:     string
  saleId:         number
  branchId:       number
}

interface Props {
  open:          boolean
  onClose:       () => void
  data:          ReceiptData
  settings:      ReceiptSettings
  cuitEmisor?:   string                          // si está presente, muestra sección facturación
  onNuevaVenta?: () => void                      // botón "Realizar otra venta"
}

// ── Formateo ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

// ── Generador de HTML para imprimir ───────────────────────────────────────────
function buildReceiptHTML(data: ReceiptData, settings: ReceiptSettings, gift: boolean): string {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const receiptId = data.invoiceNum.trim()
    || `${data.branchId}-${data.saleId}`

  const logoHTML = settings.business_logo
    ? `<img src="${settings.business_logo}" alt="" style="max-width:72px;max-height:56px;object-fit:contain;display:block;margin:0 auto 6px;" />`
    : ''

  const itemRows = data.items.map(item => {
    const hasItemDiscount = item.unit_price < item.base_price
    const priceCell = gift ? '' : `
      <td style="text-align:right;vertical-align:top;white-space:nowrap;padding-left:8px;">
        ${hasItemDiscount
          ? `<div style="font-size:11px;color:#000;text-decoration:line-through;line-height:1.3;">${fmt(item.base_price)}</div>`
          : ''}
        <div style="font-size:13px;font-weight:600;line-height:1.3;">${fmt(item.unit_price)}</div>
      </td>`

    return `
      <tr>
        <td style="padding:5px 0;vertical-align:top;">
          <div style="font-weight:600;font-size:13px;line-height:1.3;">1x ${item.product_name}</div>
          <div style="font-size:11px;color:#000;line-height:1.3;">${item.color} · T.${item.size}</div>
          <div style="font-size:10px;color:#000;font-family:monospace;line-height:1.4;">SKU: ${item.sku}</div>
        </td>
        ${priceCell}
      </tr>`
  }).join('')

  const totalsHTML = gift ? '' : `
    <tr><td colspan="2" style="padding:6px 0 0;"><hr style="border:none;border-top:1px solid #000;margin:0;" /></td></tr>
    <tr>
      <td style="font-size:12px;color:#000;padding:3px 0;">Subtotal</td>
      <td style="text-align:right;font-size:12px;color:#000;">${fmt(data.subtotal)}</td>
    </tr>
    ${data.discountAmount > 0 ? `
    <tr>
      <td style="font-size:12px;color:#000;padding:3px 0;">
        Descuento${data.discountType === 'pct' ? ` (${data.discountValue}%)` : ''}
      </td>
      <td style="text-align:right;font-size:12px;color:#000;">−${fmt(data.discountAmount)}</td>
    </tr>` : ''}
    <tr>
      <td style="font-size:17px;font-weight:700;padding:4px 0 3px;"><strong>Total:</strong></td>
      <td style="text-align:right;font-size:17px;font-weight:700;"><strong>${fmt(data.total)}</strong></td>
    </tr>
    ${data.paymentSplit && Object.keys(data.paymentSplit).length > 1
        ? Object.entries(data.paymentSplit)
            .filter(([, amt]) => (amt ?? 0) > 0)
            .map(([method, amt]) => `
    <tr>
      <td style="font-size:12px;color:#000;">${method.charAt(0).toUpperCase() + method.slice(1)}:</td>
      <td style="text-align:right;font-size:12px;color:#000;">${fmt(amt ?? 0)}</td>
    </tr>`).join('')
        : `<tr>
      <td style="font-size:12px;color:#000;">${data.payMethodLabel}:</td>
      <td style="text-align:right;font-size:12px;color:#000;">${fmt(data.total)}</td>
    </tr>`
    }`

  const noInvoice = settings.receipt_no_invoice_text || 'No válido como factura'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Recibo #${receiptId}${gift ? ' - Para regalo' : ''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;color:#000!important;}
    body{font-family:Arial,Helvetica,sans-serif;max-width:310px;margin:0 auto;padding:14px 16px;}
    @media print{
      @page{margin:6mm;size:80mm auto;}
      body{max-width:100%;padding:0;}
    }
  </style>
</head>
<body>
  <!-- Encabezado -->
  <div style="text-align:center;margin-bottom:10px;">
    ${logoHTML}
    <div style="font-size:18px;font-weight:700;">${settings.business_name || ''}</div>
    ${settings.receipt_phone   ? `<div style="font-size:12px;color:#000;margin-top:2px;">${settings.receipt_phone}</div>`   : ''}
    ${settings.receipt_address ? `<div style="font-size:11px;color:#000;margin-top:2px;">${settings.receipt_address}</div>` : ''}
    ${settings.receipt_footer  ? `<div style="font-size:11px;color:#000;margin-top:4px;">${settings.receipt_footer}</div>`  : ''}
    ${gift ? `<div style="font-size:11px;color:#000;font-style:italic;margin-top:4px;">(Comprobante para cambios)</div>` : ''}
  </div>

  <!-- Número de recibo + cantidad -->
  <div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid #000;border-bottom:2px solid #000;padding:5px 0;margin-bottom:10px;">
    <span style="font-size:12px;color:#000;">${data.items.length} item${data.items.length !== 1 ? 's' : ''} (Ctd.: ${data.items.length})</span>
    <span style="font-size:14px;font-weight:700;">RECIBO #${receiptId}</span>
  </div>

  <!-- Items y totales -->
  <table style="width:100%;border-collapse:collapse;">
    <tbody>
      ${itemRows}
      ${totalsHTML}
    </tbody>
  </table>

  <!-- Pie -->
  <div style="border-top:2px solid #000;margin-top:10px;padding-top:8px;text-align:center;">
    <div style="font-size:12px;color:#000;">${noInvoice}</div>
    <div style="font-size:11px;color:#000;margin-top:3px;">${dateStr} ${timeStr}</div>
  </div>
</body>
</html>`
}

// ── Componente ─────────────────────────────────────────────────────────────────
export function ReceiptDialog({ open, onClose, data, settings, cuitEmisor, onNuevaVenta }: Props) {
  const handlePrint = (gift: boolean) => {
    const html = buildReceiptHTML(data, settings, gift)
    const w = window.open('', '_blank', 'width=400,height=650,scrollbars=yes')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const receiptId = data.invoiceNum.trim() || `${data.branchId}-${data.saleId}`

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-violet-600" />
            Recibo #{receiptId}
          </DialogTitle>
        </DialogHeader>

        {/* Vista previa compacta */}
        <div className="border rounded-lg p-3 bg-gray-50 text-sm max-h-64 overflow-y-auto">

          {/* Encabezado */}
          <div className="text-center mb-2">
            {settings.business_logo && (
              <img
                src={settings.business_logo}
                alt="logo"
                className="max-w-14 max-h-10 object-contain mx-auto mb-1"
              />
            )}
            <p className="font-bold text-sm">{settings.business_name}</p>
            {settings.receipt_phone   && <p className="text-[11px] text-gray-500">{settings.receipt_phone}</p>}
            {settings.receipt_address && <p className="text-[10px] text-gray-400">{settings.receipt_address}</p>}
            {settings.receipt_footer  && <p className="text-[10px] text-gray-400 mt-0.5">{settings.receipt_footer}</p>}
          </div>

          {/* ID + cantidad */}
          <div className="flex justify-between items-center border-y border-gray-300 py-1 mb-1.5">
            <span className="text-[10px] text-gray-500">{data.items.length} item{data.items.length !== 1 ? 's' : ''}</span>
            <span className="text-xs font-bold">RECIBO #{receiptId}</span>
          </div>

          {/* Items */}
          <div className="space-y-1.5">
            {data.items.map(item => (
              <div key={item.id} className="flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">1x {item.product_name}</p>
                  <p className="text-[10px] text-gray-400">{item.color} · T.{item.size}</p>
                  <p className="text-[10px] text-gray-300 font-mono">SKU: {item.sku}</p>
                </div>
                <div className="text-right shrink-0">
                  {item.unit_price < item.base_price && (
                    <p className="text-[10px] text-gray-400 line-through">{fmt(item.base_price)}</p>
                  )}
                  <p className="text-xs font-semibold">{fmt(item.unit_price)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="border-t border-gray-200 mt-2 pt-1.5 space-y-0.5">
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>Subtotal</span><span>{fmt(data.subtotal)}</span>
            </div>
            {data.discountAmount > 0 && (
              <div className="flex justify-between text-[11px] text-orange-600">
                <span>Descuento {data.discountType === 'pct' ? `(${data.discountValue}%)` : ''}</span>
                <span>−{fmt(data.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold">
              <span>Total</span><span>{fmt(data.total)}</span>
            </div>
            {data.paymentSplit && Object.keys(data.paymentSplit).length > 1
              ? Object.entries(data.paymentSplit)
                  .filter(([, amt]) => (amt ?? 0) > 0)
                  .map(([method, amt]) => (
                    <div key={method} className="flex justify-between text-[11px] text-gray-500">
                      <span>{method.charAt(0).toUpperCase() + method.slice(1)}</span>
                      <span>{fmt(amt ?? 0)}</span>
                    </div>
                  ))
              : <div className="flex justify-between text-[11px] text-gray-500">
                  <span>{data.payMethodLabel}</span><span>{fmt(data.total)}</span>
                </div>
            }
          </div>

          {/* Pie */}
          <div className="border-t border-gray-200 mt-2 pt-1.5 text-center">
            <p className="text-[10px] text-gray-400">
              {settings.receipt_no_invoice_text || 'No válido como factura'}
            </p>
          </div>
        </div>

        {/* Botones de impresión */}
        <div className="flex gap-2">
          <Button
            className="flex-1 gap-2"
            onClick={() => handlePrint(false)}
          >
            <Printer className="h-4 w-4" />
            Imprimir recibo
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => handlePrint(true)}
          >
            <Gift className="h-4 w-4" />
            Para regalo
          </Button>
        </div>

        {/* Sección de facturación ARCA */}
        {cuitEmisor && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Facturación electrónica (ARCA)
            </p>
            <BotonFacturar
              ventaId={String(data.saleId)}
              cuitEmisor={cuitEmisor}
              onFacturaEmitida={(_output: FacturacionOutput) => {
                // La factura se emitió — el usuario puede cerrar o hacer nueva venta
              }}
            />
          </div>
        )}

        {/* Acciones de navegación */}
        <div className="flex gap-2 border-t border-gray-100 pt-2">
          {onNuevaVenta && (
            <Button
              variant="outline"
              className="flex-1 gap-2 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => { onClose(); onNuevaVenta() }}
            >
              <Plus className="h-4 w-4" />
              Nueva venta
            </Button>
          )}
          <Button variant="ghost" size="sm" className="flex-1 text-gray-400" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
