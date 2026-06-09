import type { ReceiptData, ReceiptSettings } from '@/components/receipt-dialog'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface TicketItem {
  product_name: string
  color:        string
  size:         string
  unit_price:   number
  base_price:   number
  sku:          string
}

export interface TicketData {
  // Negocio (de los ajustes)
  businessName:         string | null
  branchName:           string | null
  address:              string | null
  phone:                string | null
  footer:               string | null
  receiptNoInvoiceText: string | null
  // Venta
  saleId:         number
  invoiceNum:     string
  soldAt:         string | null   // ISO — null = usa hora actual en el servidor
  payMethodLabel: string
  branchId:       number
  // Items
  items: TicketItem[]
  // Importes
  subtotal:       number
  discountAmount: number
  discountType:   'pct' | 'amt'
  discountValue:  string
  total:          number
}

// ── Constructor ────────────────────────────────────────────────────────────────

/** Construye TicketData a partir de ReceiptData + ReceiptSettings */
export function buildTicketData(
  data:       ReceiptData,
  settings:   ReceiptSettings,
  branchName?: string | null,
  soldAt?:     string | null,
): TicketData {
  return {
    businessName:         settings.business_name,
    branchName:           branchName ?? null,
    address:              settings.receipt_address,
    phone:                settings.receipt_phone,
    footer:               settings.receipt_footer,
    receiptNoInvoiceText: settings.receipt_no_invoice_text,
    saleId:               data.saleId,
    invoiceNum:           data.invoiceNum,
    soldAt:               soldAt ?? null,
    payMethodLabel:       data.payMethodLabel,
    branchId:             data.branchId,
    items:                data.items.map(i => ({
      product_name: i.product_name,
      color:        i.color,
      size:         i.size,
      unit_price:   i.unit_price,
      base_price:   i.base_price,
      sku:          i.sku,
    })),
    subtotal:       data.subtotal,
    discountAmount: data.discountAmount,
    discountType:   data.discountType,
    discountValue:  data.discountValue,
    total:          data.total,
  }
}

// ── Función principal ──────────────────────────────────────────────────────────

/**
 * imprimirTicket(datos)
 *
 * Envía los datos de la venta al servidor de impresión local (localhost:3002)
 * a través del proxy /api/print/ticket de Next.js.
 * El servidor imprime directamente en la impresora "XP-80C Recibos".
 */
export async function imprimirTicket(
  datos: TicketData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/print/ticket', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(datos),
    })

    const json = await res.json() as { ok?: boolean; error?: string }

    if (!res.ok) {
      return { ok: false, error: json.error ?? 'Error al imprimir' }
    }

    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Verifica si el servidor de impresion esta corriendo y la impresora conectada */
export async function checkPrintServer(): Promise<{ available: boolean; connected: boolean; error?: string }> {
  try {
    const res  = await fetch('/api/print/ticket', { signal: AbortSignal.timeout(4000) })
    const data = await res.json() as { connected: boolean; error?: string }
    return { available: true, connected: data.connected ?? false, error: data.error }
  } catch {
    return { available: false, connected: false }
  }
}
