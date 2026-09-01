"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Package, Search, CheckCircle2, Truck, Clock,
  XCircle, Loader2, ArrowLeft, MapPin,
} from "lucide-react"
import { useStoreHref } from "../_context/store-path-context"

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TrackingEvent {
  date:    string
  detail:  string
  country: string
}

interface TrackingResult {
  orderId:           number
  buyerName:         string
  status:            string
  fulfillmentStatus: string
  carrier:           string | null
  trackingNumber:    string | null
  lastEvent:         string | null
  events:            TrackingEvent[]
  createdAt:         string
}

// ── Config de estados ─────────────────────────────────────────────────────────

type StatusKey = 'awaiting_payment' | 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

const STATUS_CONFIG: Record<StatusKey, { label: string; Icon: typeof Package; color: string; bgColor: string }> = {
  awaiting_payment: { label: 'Awaiting payment', Icon: Clock,          color: 'text-amber-600',  bgColor: 'bg-amber-50  border-amber-200'  },
  pending:          { label: 'Order received',   Icon: Clock,          color: 'text-amber-600',  bgColor: 'bg-amber-50  border-amber-200'  },
  confirmed:        { label: 'Confirmed',         Icon: CheckCircle2,   color: 'text-blue-600',   bgColor: 'bg-blue-50   border-blue-200'   },
  processing:       { label: 'Processing',        Icon: Package,        color: 'text-blue-600',   bgColor: 'bg-blue-50   border-blue-200'   },
  shipped:          { label: 'Shipped',           Icon: Truck,          color: 'text-violet-600', bgColor: 'bg-violet-50 border-violet-200' },
  delivered:        { label: 'Delivered',         Icon: CheckCircle2,   color: 'text-green-600',  bgColor: 'bg-green-50  border-green-200'  },
  cancelled:        { label: 'Cancelled',         Icon: XCircle,        color: 'text-red-600',    bgColor: 'bg-red-50    border-red-200'    },
}

function getStatusCfg(key: string) {
  return STATUS_CONFIG[key as StatusKey] ?? STATUS_CONFIG.processing
}

function fmtDate(raw: string) {
  try {
    return new Date(raw).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return raw }
}

// ── Componente interno ────────────────────────────────────────────────────────

function TrackingInner() {
  const params    = useSearchParams()
  const storeRoot = useStoreHref('')   // '/tienda' o '/store'

  const [orderId, setOrderId] = useState(params.get('id')    ?? '')
  const [email,   setEmail  ] = useState(params.get('email') ?? '')
  const [loading, setLoading] = useState(false)
  const [result,  setResult ] = useState<TrackingResult | null>(null)
  const [error,   setError  ] = useState<string | null>(null)

  const doFetch = useCallback(async (oid: string, em: string) => {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res  = await fetch(
        `/api/tienda/tracking?id=${encodeURIComponent(oid.trim())}&email=${encodeURIComponent(em.trim().toLowerCase())}`
      )
      const data = await res.json() as TrackingResult | { error: string }
      if ('error' in data) { setError(data.error); return }
      setResult(data)
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTrack = useCallback(() => {
    if (orderId.trim() && email.trim()) doFetch(orderId, email)
  }, [orderId, email, doFetch])

  // Auto-buscar si los parámetros vienen en la URL (link desde el email)
  useEffect(() => {
    const id = params.get('id')
    const em = params.get('email')
    if (id && em) {
      setOrderId(id)
      setEmail(em)
      doFetch(id, em)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statusCfg = result ? getStatusCfg(result.fulfillmentStatus || result.status) : null

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Back */}
        <Link href={storeRoot}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" /> Back to store
        </Link>

        {/* Header */}
        <div className="text-center space-y-1">
          <Package className="h-8 w-8 mx-auto" style={{ color: 'var(--store-primary)' }} />
          <h1 className="text-2xl font-bold text-gray-900">Track your order</h1>
          <p className="text-sm text-gray-500">Enter your order number and email address</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Order number</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1042"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrack()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 store-focus-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrack()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 store-focus-ring"
            />
          </div>
          <button
            onClick={handleTrack}
            disabled={loading || !orderId.trim() || !email.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold store-btn-primary disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Searching...</>
              : <><Search className="h-4 w-4" /> Track order</>
            }
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-2">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Resultado */}
        {result && statusCfg && (() => {
          const { label, Icon, color, bgColor } = statusCfg
          return (
            <div className="space-y-4">

              {/* Estado principal */}
              <div className={`rounded-2xl border p-5 ${bgColor}`}>
                <div className="flex items-center gap-3">
                  <span className={color}><Icon className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs text-gray-500">Order #{result.orderId}</p>
                    <p className={`text-lg font-bold ${color}`}>{label}</p>
                    {result.buyerName && (
                      <p className="text-sm text-gray-600">Hi, {result.buyerName}</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  Placed on {fmtDate(result.createdAt)}
                </p>
              </div>

              {/* Carrier + tracking number */}
              {(result.carrier || result.trackingNumber) && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shipment info</p>
                  {result.carrier && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Carrier</span>
                      <span className="font-medium text-gray-800">{result.carrier}</span>
                    </div>
                  )}
                  {result.trackingNumber && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tracking number</span>
                      <span className="font-mono font-medium text-gray-800 select-all">
                        {result.trackingNumber}
                      </span>
                    </div>
                  )}
                  {result.lastEvent && (
                    <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                      {result.lastEvent}
                    </p>
                  )}
                </div>
              )}

              {/* Timeline de eventos */}
              {result.events.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                    Tracking history
                  </p>
                  <ol className="relative border-l border-gray-200 space-y-5 ml-3">
                    {[...result.events].reverse().map((ev, i) => (
                      <li key={i} className="ml-4">
                        <span className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 border-white ${
                          i === 0 ? 'bg-[var(--store-primary)]' : 'bg-gray-300'
                        }`} />
                        <p className="text-xs text-gray-400">{fmtDate(ev.date)}</p>
                        <p className="text-sm font-medium text-gray-800">{ev.detail}</p>
                        {ev.country && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {ev.country}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Sin eventos todavía */}
              {result.events.length === 0 && !['pending', 'awaiting_payment'].includes(result.fulfillmentStatus) && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center text-sm text-gray-400">
                  <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Tracking information will appear here once your order ships.
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Page wrapper (Suspense requerido por useSearchParams) ─────────────────────

export default function TrackingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    }>
      <TrackingInner />
    </Suspense>
  )
}
