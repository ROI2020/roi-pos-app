"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Package, CheckCircle2, Truck, XCircle, Clock,
  RefreshCw, Printer, MapPin, Eye, Loader2,
  AlertCircle, Store, Building2, CheckCheck, MessageCircle,
  RotateCcw, ExternalLink, ShoppingBag,
} from "lucide-react"
import { toast } from "sonner"
import { provinceName } from "@/lib/correo/provinces"
import { imprimirTicket } from "@/lib/print-ticket"
import { useAdminCurrency } from "@/hooks/use-admin-currency"

// ── Tipos ─────────────────────────────────────────────────────────────────────

type OrderStatus = 'awaiting_payment' | 'approved' | 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled'

interface OrderRow {
  id:                 number
  buyer_name:         string
  buyer_phone:        string
  buyer_email:        string | null
  delivery_type:      string
  subtotal:           number
  shipping_cost:      number
  total:              number
  status:             OrderStatus
  payment_method:     string | null
  fulfillment_status: string | null
  cj_order_id:        string | null
  cj_order_num:       string | null
  cj_tracking_no:     string | null
  item_count:         number
  tracking_number:    string | null
  shipment_status:    string | null
  created_at:         string
}

interface CJFulfillment {
  status:       string | null
  cjOrderId:    string | null
  cjOrderNum:   string | null
  cjTrackingNo: string | null
}

interface OrderDetail {
  id:      number
  buyer:   { name: string; phone: string; email: string | null }
  delivery: {
    type:      string; agencyId: string | null; carrier: string | null
    rateLabel: string | null; ratePrice: number | null
    address: {
      streetName: string; streetNumber: string; floor: string | null
      department: string | null; cityName: string; state: string
      zipCode: string; observation: string | null
    } | null
  }
  subtotal:      number
  shippingCost:  number
  total:         number
  status:        OrderStatus
  paymentMethod: string | null
  notes:         string | null
  saleId:        number | null
  shipment:      { trackingNumber: string; status: string; error: string | null } | null
  fulfillment:   CJFulfillment | null
  items: {
    id: number; product_variant_id: number
    product_name: string; variant_sku: string
    variant_color: string; variant_size: string
    unit_price: number; in_stock: boolean; is_cj: boolean
  }[]
  createdAt: string
}

interface TrackingEvent { date: string; description: string; location?: string; status: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; fg: string; Icon: React.FC<{ className?: string }> }> = {
  awaiting_payment: { label: 'Esperando pago', bg: 'bg-orange-100', fg: 'text-orange-700', Icon: Clock },
  approved:  { label: 'Aprobado',    bg: 'bg-green-100',  fg: 'text-green-700',  Icon: CheckCircle2 },
  pending:   { label: 'Pendiente',   bg: 'bg-amber-100',  fg: 'text-amber-700',  Icon: Clock       },
  confirmed: { label: 'Confirmado',  bg: 'bg-blue-100',   fg: 'text-blue-700',   Icon: CheckCircle2 },
  preparing: { label: 'Preparando',  bg: 'bg-violet-100', fg: 'text-violet-700', Icon: Package      },
  shipped:   { label: 'Despachado',  bg: 'bg-cyan-100',   fg: 'text-cyan-700',   Icon: Truck        },
  delivered: { label: 'Entregado',   bg: 'bg-green-100',  fg: 'text-green-700',  Icon: CheckCheck   },
  cancelled: { label: 'Cancelado',   bg: 'bg-red-100',    fg: 'text-red-700',    Icon: XCircle      },
}

const DELIVERY_ICON: Record<string, React.FC<{ className?: string }>> = {
  pickup_store: Store,
  homeDelivery: MapPin,
  agency:       Building2,
  locker:       Building2,
}
const DELIVERY_LABEL: Record<string, string> = {
  pickup_store: 'Retiro en tienda',
  homeDelivery: 'Envío a domicilio',
  agency:       'Sucursal CA',
  locker:       'Locker CA',
}

// fmt se obtiene desde useAdminCurrency() dentro del componente (ver abajo)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const TABS: { label: string; status: OrderStatus | '' }[] = [
  { label: 'Todos',         status: ''                 },
  { label: 'Esp. pago',     status: 'awaiting_payment' },
  { label: 'Aprobados',     status: 'approved'         },
  { label: 'Pendientes',    status: 'pending'          },
  { label: 'Confirmados',   status: 'confirmed'        },
  { label: 'Preparando',    status: 'preparing'        },
  { label: 'Despachados',   status: 'shipped'          },
  { label: 'Entregados',    status: 'delivered'        },
  { label: 'Cancelados',    status: 'cancelled'        },
]

// ── Modal de detalle ──────────────────────────────────────────────────────────

function OrderDetailModal({ orderId, onClose, onRefresh }: {
  orderId:   number
  onClose:   () => void
  onRefresh: () => void
}) {
  const { fmt } = useAdminCurrency()
  const [order,           setOrder          ] = useState<OrderDetail | null>(null)
  const [loading,         setLoading        ] = useState(true)
  const [confirming,      setConfirming     ] = useState(false)
  const [cancelling,      setCancelling     ] = useState(false)
  const [delivering,      setDelivering     ] = useState(false)
  const [printingReceipt, setPrintingReceipt] = useState(false)
  const [tracking,        setTracking       ] = useState<TrackingEvent[] | null>(null)
  const [loadingTk,       setLoadingTk      ] = useState(false)
  const [printingLabel,   setPrintingLabel  ] = useState(false)
  const [retrying,        setRetrying       ] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/orders/online/${orderId}`)
      .then(r => r.json())
      .then(setOrder)
      .catch(() => toast.error('Error al cargar el pedido'))
      .finally(() => setLoading(false))
  }, [orderId])

  useEffect(() => { load() }, [load])

  // Cerrar con Escape + lock scroll
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [onClose])

  async function handleConfirm() {
    if (!order) return
    const outOfStockItems = order.items.filter(i => !i.in_stock)
    if (outOfStockItems.length > 0) {
      toast.error(`${outOfStockItems.length} item(s) sin stock: ${outOfStockItems.map(i => i.product_name).join(', ')}`)
      return
    }
    setConfirming(true)
    try {
      const res  = await fetch(`/api/orders/online/${orderId}/confirm`, { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.shipment?.error) {
        toast.warning(`Venta confirmada, pero el envío falló: ${data.shipment.error}. Podés reintentarlo.`)
      } else if (data.shipment?.trackingNumber) {
        toast.success(`Pedido confirmado · Tracking PAQ.AR: ${data.shipment.trackingNumber}`)
      } else if (order?.delivery.type === 'pickup_store') {
        toast.success('Pedido confirmado para retiro en tienda')
      } else {
        toast.success('Pedido confirmado')
      }
      load()
      onRefresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setConfirming(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm('¿Cancelar este pedido?')) return
    setCancelling(true)
    try {
      const res  = await fetch(`/api/orders/online/${orderId}/cancel`, { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.warning)      toast.warning(data.warning)
      if (data.paqarWarning) toast.warning(data.paqarWarning)
      toast.success('Pedido cancelado')
      load()
      onRefresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  // Abre WhatsApp con el número del comprador y un mensaje prearmado
  function handleNotifyWhatsApp() {
    if (!order) return
    const phone = order.buyer.phone.replace(/\D/g, '')
    const isPickup = order.delivery.type === 'pickup_store'
    const reciboRef = order.saleId ? ` (Recibo #${order.saleId})` : ''
    const msg = isPickup
      ? `¡Hola ${order.buyer.name}! 👋 Tu pedido #${order.id}${reciboRef} está *listo para retirar* en nuestra tienda. ¡Te esperamos! 🛍️`
      : `¡Hola ${order.buyer.name}! 👋 Tu pedido #${order.id}${reciboRef} fue confirmado y está siendo preparado para el envío. Te avisamos cuando salga. 📦`
    window.open(`https://wa.me/54${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function handlePrintReceipt() {
    if (!order?.saleId) return
    setPrintingReceipt(true)
    try {
      // Traer datos del negocio para el encabezado del ticket
      const settingsRes = await fetch('/api/settings')
      const settings = settingsRes.ok ? await settingsRes.json() : {}

      const result = await imprimirTicket({
        businessName:         settings.business_name         ?? null,
        branchName:           'Tienda Online',
        address:              settings.receipt_address       ?? null,
        phone:                settings.receipt_phone         ?? null,
        footer:               settings.receipt_footer        ?? null,
        receiptNoInvoiceText: settings.receipt_no_invoice_text ?? null,
        saleId:               order.saleId,
        invoiceNum:           `P-${String(order.id).padStart(6, '0')}`,
        soldAt:               order.createdAt,
        payMethodLabel:       'Pedido Online',
        branchId:             1,
        subtotal:             order.subtotal,
        discountAmount:       0,
        discountType:         'amt',
        discountValue:        '0',
        total:                order.total,
        items: order.items.map(i => ({
          product_name: i.product_name,
          color:        i.variant_color,
          size:         i.variant_size,
          unit_price:   i.unit_price,
          base_price:   i.unit_price,
          sku:          i.variant_sku,
        })),
      })

      if (!result.ok) throw new Error(result.error)
      toast.success('Recibo enviado a la impresora')
    } catch (err) {
      toast.error(`Error al imprimir: ${(err as Error).message}`)
    } finally {
      setPrintingReceipt(false)
    }
  }

  async function handleDeliver() {
    if (!window.confirm('¿Marcar este pedido como entregado / retirado?')) return
    setDelivering(true)
    try {
      const res  = await fetch(`/api/orders/online/${orderId}/deliver`, { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Pedido marcado como entregado')
      load()
      onRefresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDelivering(false)
    }
  }

  async function handlePrintLabel() {
    setPrintingLabel(true)
    try {
      const res = await fetch(`/api/orders/online/${orderId}/label`)
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error)
      }
      const blob = await res.blob()
      const pdfUrl = URL.createObjectURL(blob)

      /*
       * Impresión de rótulo para impresora térmica 100 × 150 mm
       * ─────────────────────────────────────────────────────────
       * PAQ.AR devuelve un PDF en formato A4. En lugar de abrirlo
       * directamente, lo envolvemos en una página HTML que:
       *   1. Declara @page { size: 100mm 150mm } → el diálogo de
       *      impresión del navegador preselecciona ese tamaño de papel.
       *   2. Incrusta el PDF en un <embed> del mismo tamaño → el
       *      browser escala el contenido para que llene la etiqueta.
       *   3. Dispara window.print() automáticamente (~1.5 s, tiempo
       *      suficiente para que el PDF termine de renderizar).
       *   4. Cierra la ventana al terminar (onafterprint).
       *
       * Impresora probada: Xprinter XP-470B
       * Etiquetas a comprar: rollos 100 × 150 mm (4" × 6"), papel
       * térmico directo, núcleo de 25 mm.
       *
       * Si la escala no queda perfecta en algún navegador, el usuario
       * puede ajustar desde el diálogo de impresión: "Ajustar al área
       * imprimible" o escala al 100%.
       */
      const printHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Rótulo pedido #${orderId}</title>
  <style>
    /* Papel 100×150 mm — estándar etiquetas de envío (4"×6") */
    @page { size: 100mm 150mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100mm; height: 150mm; overflow: hidden; background: #fff; }
    embed { display: block; width: 100mm; height: 150mm; border: none; }
  </style>
</head>
<body>
  <embed src="${pdfUrl}" type="application/pdf" />
  <script>
    // Esperar render del PDF antes de abrir el diálogo de impresión
    setTimeout(function() { window.print(); }, 1500);
    window.addEventListener('afterprint', function() { window.close(); });
  </script>
</body>
</html>`

      const htmlBlob = new Blob([printHtml], { type: 'text/html' })
      const htmlUrl  = URL.createObjectURL(htmlBlob)
      window.open(htmlUrl, '_blank')

      // Limpiar ambas URLs a los 2 minutos (tiempo suficiente para imprimir)
      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl)
        URL.revokeObjectURL(htmlUrl)
      }, 120_000)
    } catch (err) {
      toast.error(`Error al obtener el rótulo: ${(err as Error).message}`)
    } finally {
      setPrintingLabel(false)
    }
  }

  async function handleTracking() {
    setLoadingTk(true)
    try {
      const res  = await fetch(`/api/orders/online/${orderId}/tracking`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTracking(data.events ?? [])
      load() // refresh para actualizar last_tracking_event
    } catch (err) {
      toast.error(`Error al consultar tracking: ${(err as Error).message}`)
    } finally {
      setLoadingTk(false)
    }
  }

  async function handleRetryFulfillment() {
    setRetrying(true)
    try {
      const res  = await fetch(`/api/orders/online/${orderId}/retry-fulfillment`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.fulfilled) {
        toast.success('Fulfillment CJ enviado correctamente')
      } else {
        toast.warning('No se pudo enviar a CJ. Revisá la configuración CJ en ajustes.')
      }
      load()
      onRefresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRetrying(false)
    }
  }

  const o = order

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg bg-white flex flex-col h-full shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="text-xs text-gray-400">Pedido online</p>
            <h2 className="font-bold text-gray-900">#{orderId}</h2>
          </div>
          <div className="flex items-center gap-2">
            {o && (() => {
              const cfg = STATUS_CONFIG[o.status] ?? { label: o.status, bg: 'bg-gray-100', fg: 'text-gray-600', Icon: Clock }
              const Icon = cfg.Icon
              return (
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.fg}`}>
                  <Icon className="h-3.5 w-3.5" />{cfg.label}
                </span>
              )
            })()}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
            </div>
          ) : !o ? (
            <p className="text-center text-gray-400 py-10">No se pudo cargar el pedido</p>
          ) : (
            <>
              {/* Comprador */}
              <section className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comprador</p>
                <p className="font-semibold text-gray-900">{o.buyer.name}</p>
                <p className="text-sm text-gray-600">+{o.buyer.phone}</p>
                {o.buyer.email && <p className="text-sm text-gray-500">{o.buyer.email}</p>}
              </section>

              {/* Entrega */}
              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entrega</p>
                <div className="flex items-start gap-2">
                  {(() => {
                    const Icon = DELIVERY_ICON[o.delivery.type] ?? MapPin
                    return <Icon className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                  })()}
                  <div>
                    <p className="text-sm font-medium text-gray-800">{DELIVERY_LABEL[o.delivery.type] ?? o.delivery.type}</p>
                    {o.delivery.carrier && <p className="text-xs text-gray-500">{o.delivery.carrier} · {o.delivery.rateLabel}</p>}
                    {o.delivery.address && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {o.delivery.address.streetName} {o.delivery.address.streetNumber}
                        {o.delivery.address.floor ? ` P${o.delivery.address.floor}` : ''}
                        {o.delivery.address.department ? ` D${o.delivery.address.department}` : ''},{' '}
                        {o.delivery.address.cityName} ({provinceName(o.delivery.address.state)}){' '}
                        CP {o.delivery.address.zipCode}
                      </p>
                    )}
                    {o.delivery.agencyId && <p className="text-xs text-gray-500">Sucursal ID: {o.delivery.agencyId}</p>}
                  </div>
                </div>
                {o.shipment && (
                  <div className={`text-xs rounded-lg px-3 py-2 ${o.shipment.error ? 'bg-red-50 text-red-700' : 'bg-cyan-50 text-cyan-700'}`}>
                    {o.shipment.error
                      ? <><AlertCircle className="inline h-3 w-3 mr-1" />Error PAQ.AR: {o.shipment.error}</>
                      : <><Truck className="inline h-3 w-3 mr-1" />Tracking: <strong>{o.shipment.trackingNumber}</strong> · {o.shipment.status}</>}
                  </div>
                )}
              </section>

              {/* CJ Fulfillment */}
              {(o.fulfillment || o.paymentMethod === 'paypal') && (() => {
                const f = o.fulfillment
                const fulfilled  = !!f?.cjOrderId
                const fStatus    = f?.status ?? null
                const hasFailed  = !fulfilled && ['approved','confirmed','processing','preparing'].includes(o.status)

                const CJ_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
                  submitted: { label: 'Enviado a CJ',  bg: 'bg-blue-50',   fg: 'text-blue-700'   },
                  shipped:   { label: 'Despachado CJ', bg: 'bg-cyan-50',   fg: 'text-cyan-700'   },
                  delivered: { label: 'Entregado CJ',  bg: 'bg-green-50',  fg: 'text-green-700'  },
                }
                const stCfg = fStatus ? (CJ_STATUS[fStatus] ?? { label: fStatus, bg: 'bg-gray-50', fg: 'text-gray-600' }) : null

                return (
                  <section className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CJ Dropshipping</p>

                    {hasFailed && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                        <span>El fulfillment no llegó a CJ. Podés reintentarlo con el botón de abajo.</span>
                      </div>
                    )}

                    {stCfg && (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${stCfg.bg} ${stCfg.fg}`}>
                        <ShoppingBag className="h-3 w-3" />{stCfg.label}
                      </span>
                    )}

                    {f?.cjOrderNum && (
                      <div className="flex justify-between text-xs text-gray-600">
                        <span className="text-gray-400">Orden CJ</span>
                        <span className="font-mono">{f.cjOrderNum}</span>
                      </div>
                    )}

                    {f?.cjTrackingNo && (
                      <div className="flex justify-between text-xs text-gray-600">
                        <span className="text-gray-400">Tracking CJ</span>
                        <span className="font-mono select-all">{f.cjTrackingNo}</span>
                      </div>
                    )}
                  </section>
                )
              })()}

              {/* Items */}
              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Productos</p>
                <ul className="space-y-2">
                  {o.items.map(item => (
                    <li key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${!item.in_stock ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-500">{item.variant_color} · T.{item.variant_size} · {item.variant_sku}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-violet-700">{fmt(item.unit_price)}</p>
                        {!item.in_stock && (
                          <p className="text-[10px] text-red-600 font-semibold">Sin stock</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Totales */}
              <section className="border-t pt-4 space-y-1">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span><span>{fmt(o.subtotal)}</span>
                </div>
                {o.shippingCost > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Envío</span><span>{fmt(o.shippingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
                  <span>Total</span><span className="text-violet-700">{fmt(o.total)}</span>
                </div>
                {o.saleId && (
                  <p className="text-xs text-gray-400">Venta POS generada: #{o.saleId}</p>
                )}
              </section>

              {o.notes && (
                <section className="bg-amber-50 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Notas</p>
                  <p className="text-sm text-amber-800">{o.notes}</p>
                </section>
              )}

              {/* Tracking events */}
              {tracking !== null && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historial de tracking</p>
                  {tracking.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin eventos registrados aún</p>
                  ) : (
                    <ul className="space-y-2">
                      {[...tracking].reverse().map((ev, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0" />
                          <div>
                            <p className="text-gray-800">{ev.description}</p>
                            <p className="text-xs text-gray-400">{ev.date}{ev.location ? ` · ${ev.location}` : ''}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* Acciones */}
        {o && (
          <div className="border-t px-5 py-4 space-y-2 shrink-0 bg-white">
            {/* Esperando pago de MP */}
            {o.status === 'awaiting_payment' && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                <p>El cliente aún no completó el pago en MercadoPago. El pedido se activará automáticamente cuando se acredite.</p>
              </div>
            )}

            {/* Confirmar */}
            {o.status === 'pending' && (
              <button onClick={handleConfirm} disabled={confirming}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-semibold text-sm transition-colors">
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {confirming ? 'Confirmando…' : 'Confirmar pedido y despachar'}
              </button>
            )}

            {/* Retry CJ fulfillment — solo cuando no se envió a CJ y el pago ya fue aprobado */}
            {!o.fulfillment?.cjOrderId &&
              ['approved','confirmed','processing','preparing'].includes(o.status) && (
              <button onClick={handleRetryFulfillment} disabled={retrying}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-amber-200 text-amber-700 hover:bg-amber-50 font-medium text-sm transition-colors">
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {retrying ? 'Enviando a CJ…' : 'Reintentar fulfillment CJ'}
              </button>
            )}

            {/* Imprimir recibo de venta */}
            {o.saleId && o.status !== 'cancelled' && (
              <button onClick={handlePrintReceipt} disabled={printingReceipt}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-50 font-medium text-sm transition-colors">
                {printingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {printingReceipt ? 'Imprimiendo…' : `Imprimir recibo #${o.saleId}`}
              </button>
            )}

            {/* Rótulo */}
            {o.shipment?.trackingNumber && o.status !== 'cancelled' && (
              <button onClick={handlePrintLabel} disabled={printingLabel}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-50 font-medium text-sm transition-colors">
                {printingLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {printingLabel ? 'Generando PDF…' : 'Imprimir rótulo'}
              </button>
            )}

            {/* Tracking */}
            {o.shipment?.trackingNumber && (
              <button onClick={handleTracking} disabled={loadingTk}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium text-sm transition-colors">
                {loadingTk ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {loadingTk ? 'Consultando…' : 'Ver tracking'}
              </button>
            )}

            {/* Cancelar */}
            {/* Avisar por WhatsApp (solo pedidos activos con número de teléfono) */}
            {o.status !== 'cancelled' && o.status !== 'delivered' && o.buyer.phone && (
              <button onClick={handleNotifyWhatsApp}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-green-200 text-green-600 hover:bg-green-50 font-medium text-sm transition-colors">
                <MessageCircle className="h-4 w-4" />
                {o.delivery.type === 'pickup_store'
                  ? 'Avisar que está listo para retirar'
                  : 'Avisar por WhatsApp'}
              </button>
            )}

            {/* Marcar como entregado / retirado */}
            {['confirmed', 'preparing', 'shipped'].includes(o.status) && (
              <button onClick={handleDeliver} disabled={delivering}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold text-sm transition-colors">
                {delivering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                {delivering
                  ? 'Guardando…'
                  : o.delivery.type === 'pickup_store'
                    ? 'Marcar como retirado'
                    : 'Marcar como entregado'}
              </button>
            )}

            {o.status !== 'cancelled' && o.status !== 'delivered' && (
              <button onClick={handleCancel} disabled={cancelling}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 font-medium text-sm transition-colors">
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {cancelling ? 'Cancelando…' : 'Cancelar pedido'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PedidosPage() {
  const { fmt } = useAdminCurrency()
  const [tab,     setTab    ] = useState<OrderStatus | ''>('')
  const [orders,  setOrders ] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const qs = tab ? `?status=${tab}` : ''
    fetch(`/api/orders/online${qs}`)
      .then(r => r.json())
      .then(setOrders)
      .catch(() => toast.error('Error al cargar pedidos'))
      .finally(() => setLoading(false))
  }, [tab])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-gray-50">

      {selectedId !== null && (
        <OrderDetailModal
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={load}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6">

        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Store className="h-5 w-5 text-violet-600" />
            Pedidos Online
          </h1>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto scrollbar-none gap-1 mb-5 bg-white rounded-xl border p-1">
          {TABS.map(t => (
            <button key={t.status} onClick={() => setTab(t.status)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${tab === t.status ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
            <Package className="h-12 w-12" />
            <p className="text-gray-400">No hay pedidos {tab && `en estado "${TABS.find(t => t.status === tab)?.label.toLowerCase()}"`}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map(order => {
              const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, bg: 'bg-gray-100', fg: 'text-gray-600', Icon: Clock }
              const Icon = cfg.Icon
              const DelivIcon = DELIVERY_ICON[order.delivery_type] ?? MapPin
              return (
                <button key={order.id} onClick={() => setSelectedId(order.id)}
                  className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-100 transition-all p-4 text-left">
                  <div className="flex items-start gap-3">
                    {/* Estado */}
                    <div className={`p-2 rounded-xl ${cfg.bg} shrink-0`}>
                      <Icon className={`h-5 w-5 ${cfg.fg}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{order.buyer_name}</p>
                          <p className="text-xs text-gray-400">
                            #{order.id} · {fmtDate(order.created_at)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-violet-700">{fmt(order.total)}</p>
                          <p className="text-[11px] text-gray-400">{order.item_count} item{order.item_count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.fg}`}>
                          <Icon className="h-3 w-3" />{cfg.label}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-500">
                          <DelivIcon className="h-3 w-3" />{DELIVERY_LABEL[order.delivery_type] ?? order.delivery_type}
                        </span>
                        {/* CJ: fulfillment badge */}
                        {order.cj_order_id && order.fulfillment_status === 'submitted' && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">CJ enviado</span>
                        )}
                        {order.cj_order_id && order.fulfillment_status === 'shipped' && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-600">CJ despachado</span>
                        )}
                        {order.cj_order_id && order.fulfillment_status === 'delivered' && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600">CJ entregado</span>
                        )}
                        {/* CJ: alerta si no se envió a CJ y el pago está aprobado */}
                        {!order.cj_order_id && order.payment_method === 'paypal' &&
                          ['approved','confirmed','processing','preparing'].includes(order.status) && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            ⚠ Sin CJ
                          </span>
                        )}
                        {/* Tracking: CJ primero, PAQ.AR como fallback */}
                        {(order.cj_tracking_no || order.tracking_number) && (
                          <span className="text-[11px] text-cyan-600 font-mono">
                            {order.cj_tracking_no ?? order.tracking_number}
                          </span>
                        )}
                      </div>
                    </div>

                    <Eye className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
