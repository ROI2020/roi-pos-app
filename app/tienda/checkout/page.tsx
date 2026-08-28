"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js"
import { useTranslations, useMessages } from "next-intl"
import {
  ArrowLeft, ShoppingCart, MapPin, Store, Building2,
  AlertCircle, Loader2, CreditCard, Package,
} from "lucide-react"
import { useCart }      from "../_context/cart-context"
import { useCurrency }  from "../_context/currency-context"
import { useStoreHref } from "../_context/store-path-context"
import { PAQAR_PROVINCES } from "@/lib/correo/provinces"
import { US_STATES }       from "@/lib/us-states"
import Link from "next/link"
import type { ComponentType } from "react"

// ── Tipos ─────────────────────────────────────────────────────────────────────

type DeliveryType = 'pickup_store' | 'homeDelivery' | 'agency'

interface ShippingRate {
  id:            number
  carrier:       string
  display_name:  string
  zone_name:     string
  delivery_type: string
  display_label: string
  price:         number
}

interface Agency {
  agencyId:  string
  name:      string
  address:   string
  cityName:  string
  state:     string
  zipCode:   string
  phone?:    string
  schedule?: string
}

interface BuyerData {
  name:  string
  phone: string
  email: string
}

interface DeliveryData {
  type:         DeliveryType
  rateId:       number | null
  agencyId:     string
  agencyName:   string
  state:        string
  streetName:   string
  streetNumber: string
  floor:        string
  department:   string
  cityName:     string
  zipCode:      string
  observation:  string
}

interface TiendaConfig {
  payment_gateway:  string
  paypal_client_id: string | null
  paypal_mode:      string
  currency:         string
}

// ── Step 1 — Datos del comprador ──────────────────────────────────────────────

function StepBuyer({ data, onChange, isUS }: {
  data:     BuyerData
  onChange: (d: BuyerData) => void
  isUS:     boolean
}) {
  const t = useTranslations('Checkout')
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">{t('buyer.title')}</h2>
      <div className="space-y-3">

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t('buyer.name')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text" value={data.name} autoFocus
            onChange={e => onChange({ ...data, name: e.target.value })}
            placeholder={isUS ? 'e.g. Jane Smith' : 'Ej: María García'}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t('buyer.phone')} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <div className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 shrink-0">
              {t('buyer.phonePrefix')}
            </div>
            <input
              type="tel" value={data.phone}
              onChange={e => onChange({ ...data, phone: e.target.value.replace(/\D/g, '') })}
              placeholder={t('buyer.phonePlaceholder')}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">{t('buyer.phoneHint')}</p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t('buyer.email')}{' '}
            <span className="text-gray-400 font-normal">{t('buyer.emailOptional')}</span>
          </label>
          <input
            type="email" value={data.email}
            onChange={e => onChange({ ...data, email: e.target.value })}
            placeholder="email@example.com"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 2 — Tipo de entrega ──────────────────────────────────────────────────

function StepDelivery({ data, onChange, isUS }: {
  data:     DeliveryData
  onChange: (d: DeliveryData) => void
  isUS:     boolean
}) {
  const t = useTranslations('Checkout')
  const { fmt } = useCurrency()

  const [rates,           setRates          ] = useState<ShippingRate[]>([])
  const [agencies,        setAgencies       ] = useState<Agency[]>([])
  const [loadingRates,    setLoadingRates   ] = useState(false)
  const [loadingAgencies, setLoadingAgencies] = useState(false)
  const [agencyError,     setAgencyError    ] = useState('')

  // Tarifas Correo (solo AR, cuando cambia provincia o tipo de entrega)
  useEffect(() => {
    if (isUS || !data.state || data.type === 'pickup_store') { setRates([]); return }
    setLoadingRates(true)
    fetch(`/api/shipping/rates?state=${data.state}`)
      .then(r => r.json())
      .then((rs: ShippingRate[]) => {
        const filtered = rs.filter(r =>
          data.type === 'homeDelivery'
            ? r.delivery_type === 'homeDelivery'
            : r.delivery_type === 'agency' || r.delivery_type === 'locker'
        )
        setRates(filtered)
        if (filtered.length === 1 && !data.rateId)
          onChange({ ...data, rateId: filtered[0].id })
      })
      .catch(() => setRates([]))
      .finally(() => setLoadingRates(false))
  }, [data.state, data.type, isUS]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sucursales Correo (solo AR, cuando cambia provincia en modo agency)
  useEffect(() => {
    if (isUS || data.type !== 'agency' || !data.state) { setAgencies([]); return }
    setLoadingAgencies(true)
    setAgencyError('')
    fetch(`/api/shipping/agencies?province=${data.state}&delivers=true`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((result: Agency[] | { agencies: Agency[]; error?: string }) => {
        const list = Array.isArray(result) ? result : result.agencies ?? []
        setAgencies(list)
        if (!Array.isArray(result) && result.error)
          setAgencyError(t('delivery.noAgencies'))
      })
      .catch(() => setAgencyError(t('delivery.noAgencies')))
      .finally(() => setLoadingAgencies(false))
  }, [data.state, data.type, isUS]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (partial: Partial<DeliveryData>) => onChange({ ...data, ...partial })

  // Opciones de entrega (la opción 'agency' no aplica para US)
  type DeliveryOption = {
    value: DeliveryType
    label: string
    desc:  string
    Icon:  ComponentType<{ className?: string }>
  }
  const options: DeliveryOption[] = [
    { value: 'pickup_store', label: t('delivery.pickup.label'), desc: t('delivery.pickup.desc'), Icon: Store },
    { value: 'homeDelivery', label: t('delivery.home.label'),   desc: t('delivery.home.desc'),   Icon: MapPin },
    ...(!isUS ? [{ value: 'agency' as DeliveryType, label: t('delivery.agency.label'), desc: t('delivery.agency.desc'), Icon: Building2 }] : []),
  ]

  // Lista de regiones (US States o provincias AR)
  const regionList = isUS
    ? US_STATES.map(s => ({ code: s.code, name: s.name }))
    : PAQAR_PROVINCES

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-gray-800">{t('delivery.title')}</h2>

      {/* Opciones de entrega */}
      <div className="space-y-2">
        {options.map(({ value, label, desc, Icon }) => (
          <button key={value}
            onClick={() => set({ type: value, rateId: null, agencyId: '', agencyName: '' })}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all
              ${data.type === value ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${data.type === value ? 'text-violet-600' : 'text-gray-400'}`} />
            <div>
              <p className={`text-sm font-semibold ${data.type === value ? 'text-violet-700' : 'text-gray-800'}`}>{label}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Formulario de domicilio */}
      {data.type === 'homeDelivery' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t('delivery.addressTitle')}</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t('delivery.province')} <span className="text-red-500">*</span>
              </label>
              <select value={data.state} onChange={e => set({ state: e.target.value, rateId: null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                <option value="">{t('delivery.selectProvince')}</option>
                {regionList.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t('delivery.zipCode')} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={data.zipCode} onChange={e => set({ zipCode: e.target.value })}
                placeholder={t('delivery.zipPlaceholder')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t('delivery.street')} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={data.streetName} onChange={e => set({ streetName: e.target.value })}
                placeholder={t('delivery.streetPlaceholder')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t('delivery.number')} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={data.streetNumber} onChange={e => set({ streetNumber: e.target.value })}
                placeholder={t('delivery.numberPlaceholder')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('delivery.floor')}</label>
              <input type="text" value={data.floor} onChange={e => set({ floor: e.target.value })}
                placeholder="3"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('delivery.apt')}</label>
              <input type="text" value={data.department} onChange={e => set({ department: e.target.value })}
                placeholder="A"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('delivery.city')} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={data.cityName} onChange={e => set({ cityName: e.target.value })}
              placeholder={t('delivery.cityPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('delivery.notes')}</label>
            <input type="text" value={data.observation} onChange={e => set({ observation: e.target.value })}
              placeholder={t('delivery.notesPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          {/* Tarifas Correo — solo AR */}
          {!isUS && data.state && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">{t('delivery.shippingCost')}</p>
              {loadingRates ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('delivery.calculating')}
                </div>
              ) : rates.length === 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {t('delivery.noRates')}
                </div>
              ) : (
                <div className="space-y-2">
                  {rates.map(rate => (
                    <button key={rate.id} onClick={() => set({ rateId: rate.id })}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all
                        ${data.rateId === rate.id ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{rate.display_label}</p>
                        <p className="text-xs text-gray-500">{rate.display_name}</p>
                      </div>
                      <span className={`text-sm font-bold ${data.rateId === rate.id ? 'text-violet-700' : 'text-gray-700'}`}>
                        {rate.price === 0 ? t('delivery.toConsult') : fmt(rate.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sucursales — solo AR */}
      {!isUS && data.type === 'agency' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t('delivery.agencyTitle')}</p>

          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('delivery.province')}</label>
            <select value={data.state}
              onChange={e => set({ state: e.target.value, agencyId: '', agencyName: '', rateId: null })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="">{t('delivery.selectProvinceFull')}</option>
              {PAQAR_PROVINCES.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>

          {data.state && (
            loadingAgencies ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('delivery.loadingAgencies')}
              </div>
            ) : agencyError ? (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {agencyError}
              </div>
            ) : agencies.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">{t('delivery.noAgencies')}</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {agencies.map(ag => (
                  <button key={ag.agencyId}
                    onClick={() => set({ agencyId: ag.agencyId, agencyName: ag.name })}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all
                      ${data.agencyId === ag.agencyId ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="text-sm font-semibold text-gray-800">{ag.name}</p>
                    <p className="text-xs text-gray-500">{ag.address}, {ag.cityName}</p>
                    {ag.schedule && <p className="text-[11px] text-gray-400 mt-0.5">{ag.schedule}</p>}
                  </button>
                ))}
              </div>
            )
          )}

          {/* Tarifas de sucursal */}
          {data.state && !loadingAgencies && rates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">{t('delivery.agencyRate')}</p>
              {loadingRates ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('delivery.calculating')}
                </div>
              ) : (
                <div className="space-y-2">
                  {rates.map(rate => (
                    <button key={rate.id} onClick={() => set({ rateId: rate.id })}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all
                        ${data.rateId === rate.id ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{rate.display_label}</p>
                        <p className="text-xs text-gray-500">{rate.display_name}</p>
                      </div>
                      <span className="text-sm font-bold text-gray-700">
                        {rate.price === 0 ? t('delivery.toConsult') : fmt(rate.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 3 — Resumen ──────────────────────────────────────────────────────────

function StepSummary({ buyer, delivery, items, shippingCost, gateway, isUS }: {
  buyer:        BuyerData
  delivery:     DeliveryData
  items:        import('../_context/cart-context').CartItem[]
  shippingCost: number
  gateway:      string
  isUS:         boolean
}) {
  const t = useTranslations('Checkout')
  const { fmt } = useCurrency()
  const subtotal = items.reduce((s, i) => s + i.price, 0)
  const total    = subtotal + shippingCost

  const deliveryLabel: Record<DeliveryType, string> = {
    pickup_store: t('summary.pickup'),
    homeDelivery: t('summary.homeDelivery'),
    agency:       t('summary.agencyPickup'),
  }

  const gatewayName  = gateway === 'paypal' ? 'PayPal' : 'MercadoPago'
  const phoneDisplay = isUS ? `+1 ${buyer.phone}` : `+54 ${buyer.phone}`

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-gray-800">{t('summary.title')}</h2>

      {/* Items */}
      <ul className="space-y-3">
        {items.map(item => (
          <li key={item.variantId} className="flex gap-3">
            <div className="w-12 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
              {item.specificImageUrl
                ? <img src={item.specificImageUrl} alt={item.productName} className="w-full h-full object-cover" />
                : item.hasImage
                  ? <img src={`/api/images/products/${item.productId}`} alt={item.productName} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center bg-violet-100">
                      <span className="text-sm font-bold text-violet-300">{item.productName.charAt(0)}</span>
                    </div>
              }
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.productName}</p>
              <p className="text-xs text-gray-500">
                {item.color !== 'Varios' ? `${item.color} · ` : ''}{item.size}
              </p>
              <p className="text-sm font-bold text-violet-700 mt-0.5">{fmt(item.price)}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Datos del comprador y entrega */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{t('summary.buyer')}</span>
          <span className="font-medium text-gray-800">{buyer.name}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>{t('summary.whatsapp')}</span>
          <span className="font-medium text-gray-800">{phoneDisplay}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>{t('summary.delivery')}</span>
          <span className="font-medium text-gray-800">{deliveryLabel[delivery.type]}</span>
        </div>
        {delivery.type === 'agency' && delivery.agencyName && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t('summary.branch')}</span>
            <span className="font-medium text-gray-800 text-right max-w-[180px]">{delivery.agencyName}</span>
          </div>
        )}
        {delivery.type === 'homeDelivery' && delivery.streetName && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t('summary.address')}</span>
            <span className="font-medium text-gray-800 text-right max-w-[180px]">
              {delivery.streetName} {delivery.streetNumber}, {delivery.cityName}
            </span>
          </div>
        )}
      </div>

      {/* Totales */}
      <div className="border-t pt-3 space-y-1.5">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{t('summary.subtotal')}</span><span>{fmt(subtotal)}</span>
        </div>
        {shippingCost > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t('summary.shipping')}</span><span>{fmt(shippingCost)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
          <span>{t('summary.total')}</span>
          <span className="text-violet-700">{fmt(total)}</span>
        </div>
      </div>

      {/* Nota de pago */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          {t('summary.paymentNote', { gateway: gatewayName })}
        </p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const t        = useTranslations('Checkout')
  const messages = useMessages()
  const router   = useRouter()

  const { items, clearCart }          = useCart()
  const { fmt, locale, currency }     = useCurrency()
  const storeHref                     = useStoreHref('')
  const isUS                          = locale.startsWith('en')

  // Steps: leídos desde los mensajes para soportar ambos idiomas
  const STEPS: string[] = ((messages['Checkout'] as Record<string, unknown>)['steps'] as string[] | undefined)
    ?? ['Step 1', 'Step 2', 'Step 3']

  // ── Config de la pasarela ────────────────────────────────────────────────────
  const [gateway,        setGateway      ] = useState('')
  const [paypalClientId, setPaypalClientId] = useState('')
  const [paypalMode,     setPaypalMode    ] = useState('sandbox')
  const [configLoaded,   setConfigLoaded  ] = useState(false)

  useEffect(() => {
    fetch('/api/tienda/config')
      .then(r => r.json())
      .then((d: TiendaConfig) => {
        setGateway(d.payment_gateway ?? 'mercadopago')
        setPaypalClientId(d.paypal_client_id ?? '')
        setPaypalMode(d.paypal_mode ?? 'sandbox')
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true))
  }, [])

  // ── Estado del formulario ────────────────────────────────────────────────────
  const [step,    setStep   ] = useState(0)
  const [sending, setSending] = useState(false)
  const [error,   setError  ] = useState('')

  const [buyer, setBuyer] = useState<BuyerData>({ name: '', phone: '', email: '' })
  const [delivery, setDelivery] = useState<DeliveryData>({
    type: 'pickup_store', rateId: null,
    agencyId: '', agencyName: '', state: '',
    streetName: '', streetNumber: '', floor: '', department: '',
    cityName: '', zipCode: '', observation: '',
  })

  // ID interno de la orden PayPal — guardado cuando se crea la orden en PayPal
  const [internalOrderId, setInternalOrderId] = useState(0)

  // Precio de envío (solo AR con Correo)
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null)
  useEffect(() => {
    if (!delivery.rateId) { setSelectedRate(null); return }
    fetch('/api/shipping/rates')
      .then(r => r.json())
      .then((rs: ShippingRate[]) => setSelectedRate(rs.find(r => r.id === delivery.rateId) ?? null))
      .catch(() => {})
  }, [delivery.rateId])

  const shippingCost = selectedRate?.price ?? 0
  const cartSubtotal = items.reduce((s, i) => s + i.price, 0)
  const total        = cartSubtotal + shippingCost

  // Redirigir si el carrito está vacío
  useEffect(() => {
    if (items.length === 0) router.replace(storeHref)
  }, [items.length, router, storeHref])

  // ── Validaciones ─────────────────────────────────────────────────────────────
  function validateStep(): string | null {
    if (step === 0) {
      if (!buyer.name.trim())               return t('errors.nameRequired')
      if (!buyer.phone.trim())              return t('errors.phoneRequired')
      if (buyer.phone.trim().length < 7)    return t('errors.phoneInvalid')
    }
    if (step === 1) {
      if (delivery.type === 'homeDelivery') {
        if (!delivery.state)                return t('errors.provinceRequired')
        if (!delivery.streetName.trim())    return t('errors.streetRequired')
        if (!delivery.streetNumber.trim())  return t('errors.numberRequired')
        if (!delivery.cityName.trim())      return t('errors.cityRequired')
        if (!delivery.zipCode.trim())       return t('errors.zipRequired')
      }
      if (delivery.type === 'agency') {
        if (!delivery.state)                return t('errors.provinceRequired')
        if (!delivery.agencyId)             return t('errors.agencyRequired')
      }
    }
    return null
  }

  function handleNext() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => s + 1)
  }

  // ── Armar body del pedido ────────────────────────────────────────────────────
  const buildOrderBody = useCallback(() => {
    const raw   = buyer.phone.replace(/\D/g, '')
    const phone = isUS
      ? `1${raw}`
      : `549${raw.replace(/^0?/, '').replace(/^15/, '')}`

    return {
      items: items.map(i => ({
        variantId:   i.variantId,
        unitPrice:   i.price,
        productName: i.productName,
        variantSku:  i.variantSku,
        color:       i.color,
        size:        i.size,
      })),
      buyerName:      buyer.name.trim(),
      buyerPhone:     phone,
      buyerEmail:     buyer.email.trim() || undefined,
      deliveryType:   delivery.type,
      shippingRateId: delivery.rateId ?? undefined,
      agencyId:       delivery.agencyId || undefined,
      address: delivery.type === 'homeDelivery' ? {
        streetName:   delivery.streetName.trim(),
        streetNumber: delivery.streetNumber.trim(),
        floor:        delivery.floor.trim()       || undefined,
        department:   delivery.department.trim()  || undefined,
        cityName:     delivery.cityName.trim(),
        state:        delivery.state,
        zipCode:      delivery.zipCode.trim(),
        observation:  delivery.observation.trim() || undefined,
      } : undefined,
    }
  }, [buyer, delivery, items, isUS])

  // ── PayPal: crear orden ──────────────────────────────────────────────────────
  async function handleCreatePayPalOrder(): Promise<string> {
    setError('')
    const res  = await fetch('/api/paypal/create-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildOrderBody()),
    })
    const data = await res.json() as { paypalOrderId?: string; internalOrderId?: number; error?: string }
    if (!res.ok || !data.paypalOrderId) {
      throw new Error(data.error ?? 'Error al crear la orden en PayPal')
    }
    setInternalOrderId(data.internalOrderId ?? 0)
    return data.paypalOrderId
  }

  // ── PayPal: capturar pago ────────────────────────────────────────────────────
  async function handlePayPalApprove(paypalData: { orderID: string }) {
    setSending(true)
    try {
      const res = await fetch('/api/paypal/capture-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paypalOrderId: paypalData.orderID, internalOrderId }),
      })
      const data = await res.json() as { success?: boolean; error?: string; orderId?: number }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Error al capturar el pago')
      clearCart()
      const oid = data.orderId ?? internalOrderId
      router.push(`${storeHref}/success?orderId=${oid}`)
    } catch {
      setError(t('errors.connectionError'))
    } finally {
      setSending(false)
    }
  }

  // ── MercadoPago: confirmar pedido ────────────────────────────────────────────
  async function handleConfirmMP() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setSending(true)
    try {
      const res  = await fetch('/api/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildOrderBody()),
      })
      const data = await res.json() as {
        orderId?: number; initPoint?: string; error?: string; outOfStock?: number[]
      }
      if (!res.ok) {
        if (res.status === 422 && data.outOfStock) {
          setError(t('errors.noStock'))
        } else {
          setError(data.error ?? t('errors.paymentError'))
        }
        return
      }
      if (!data.initPoint) { setError(t('errors.paymentError')); return }
      window.location.href = data.initPoint
    } catch {
      setError(t('errors.connectionError'))
    } finally {
      setSending(false)
    }
  }

  // ── Botón de pago según gateway ──────────────────────────────────────────────
  const isLastStep        = step === STEPS.length - 1
  const showPayPalButtons = isLastStep && configLoaded && gateway === 'paypal' && !!paypalClientId
  const showMPButton      = isLastStep && configLoaded && gateway !== 'paypal'
  const showConfigSpinner = isLastStep && !configLoaded

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {step > 0 ? (
            <button onClick={() => { setStep(s => s - 1); setError('') }}
              className="text-gray-500 hover:text-gray-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <Link href={storeHref} className="text-gray-500 hover:text-gray-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium">
              {t('stepLabel', { current: step + 1, total: STEPS.length })}
            </p>
            <p className="text-sm font-semibold text-gray-900">{STEPS[step]}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <ShoppingCart className="h-4 w-4" />
            <span>{items.length}</span>
          </div>
        </div>
        {/* Barra de progreso */}
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-violet-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      {/* Mini-resumen del carrito */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-2 text-sm">
          <Package className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="flex-1 text-gray-700 truncate">
            {items.map(i => i.productName).slice(0, 2).join(', ')}
            {items.length > 2 ? '…' : ''}
          </span>
          <span className="font-bold text-gray-900 shrink-0">{fmt(cartSubtotal)}</span>
        </div>
      </div>

      {/* Contenido del step */}
      <main className="max-w-lg mx-auto px-4 py-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          {step === 0 && <StepBuyer data={buyer} onChange={setBuyer} isUS={isUS} />}
          {step === 1 && <StepDelivery data={delivery} onChange={setDelivery} isUS={isUS} />}
          {step === 2 && (
            <StepSummary
              buyer={buyer} delivery={delivery}
              items={items} shippingCost={shippingCost}
              gateway={gateway} isUS={isUS}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Botones de acción */}
        <div className="mt-4">
          {step < STEPS.length - 1 ? (
            /* Continuar → siguiente step */
            <button onClick={handleNext}
              className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors shadow-lg shadow-violet-100">
              {t('continue')}
            </button>
          ) : showConfigSpinner ? (
            /* Esperando config */
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : showPayPalButtons ? (
            /* PayPal Smart Buttons */
            <PayPalScriptProvider options={{
              clientId: paypalClientId,
              currency,
              intent:   'capture',
            }}>
              <PayPalButtons
                style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' }}
                createOrder={handleCreatePayPalOrder}
                onApprove={handlePayPalApprove}
                onError={() => setError(t('errors.connectionError'))}
                disabled={sending}
              />
            </PayPalScriptProvider>
          ) : showMPButton ? (
            /* MercadoPago */
            <button onClick={handleConfirmMP} disabled={sending}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold text-sm transition-colors shadow-lg shadow-violet-100">
              {sending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CreditCard className="h-4 w-4" />}
              {sending ? t('processing') : t('pay', { gateway: 'MercadoPago' })}
            </button>
          ) : null}
        </div>

        {/* Total con envío */}
        {delivery.type !== 'pickup_store' && shippingCost > 0 && step > 0 && (
          <p className="text-center text-xs text-gray-400 mt-3">
            {t('totalWithShipping', { total: fmt(total) })}
          </p>
        )}
      </main>
    </div>
  )
}
