"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, ShoppingCart, MapPin, Store, Building2,
  AlertCircle, Loader2, CreditCard, Package,
} from "lucide-react"
import { useCart } from "../_context/cart-context"
import { fmt } from "../_utils"
import { PAQAR_PROVINCES } from "@/lib/correo/provinces"
import Link from "next/link"

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

// ── Step 1 — Datos del comprador ──────────────────────────────────────────────

interface BuyerData {
  name:  string
  phone: string
  email: string
}

function StepBuyer({ data, onChange }: {
  data:     BuyerData
  onChange: (d: BuyerData) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">Tus datos</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Nombre completo <span className="text-red-500">*</span>
          </label>
          <input
            type="text" value={data.name} autoFocus
            onChange={e => onChange({ ...data, name: e.target.value })}
            placeholder="Ej: María García"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Teléfono / WhatsApp <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <div className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 shrink-0">
              🇦🇷 +54
            </div>
            <input
              type="tel" value={data.phone}
              onChange={e => onChange({ ...data, phone: e.target.value.replace(/\D/g, '') })}
              placeholder="9 11 1234 5678"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Sin el 0 ni el 15. Ej: 9 11 1234 5678
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Email <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="email" value={data.email}
            onChange={e => onChange({ ...data, email: e.target.value })}
            placeholder="tu@email.com"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 2 — Tipo de entrega ──────────────────────────────────────────────────

interface DeliveryData {
  type:           DeliveryType
  rateId:         number | null
  agencyId:       string
  agencyName:     string
  state:          string    // código PAQ.AR (1 letra)
  streetName:     string
  streetNumber:   string
  floor:          string
  department:     string
  cityName:       string
  zipCode:        string
  observation:    string
}

function StepDelivery({ data, onChange }: {
  data:     DeliveryData
  onChange: (d: DeliveryData) => void
}) {
  const [rates,          setRates         ] = useState<ShippingRate[]>([])
  const [agencies,       setAgencies      ] = useState<Agency[]>([])
  const [loadingRates,   setLoadingRates  ] = useState(false)
  const [loadingAgencies, setLoadingAgencies] = useState(false)
  const [agencyError,    setAgencyError   ] = useState('')

  // Cargar tarifas cuando cambia la provincia
  useEffect(() => {
    if (!data.state || data.type === 'pickup_store') { setRates([]); return }
    setLoadingRates(true)
    fetch(`/api/shipping/rates?state=${data.state}`)
      .then(r => r.json())
      .then((rs: ShippingRate[]) => {
        // Filtrar por tipo de entrega seleccionado
        const filtered = rs.filter(r =>
          data.type === 'homeDelivery'
            ? r.delivery_type === 'homeDelivery'
            : r.delivery_type === 'agency' || r.delivery_type === 'locker'
        )
        setRates(filtered)
        // Auto-seleccionar si hay solo una tarifa
        if (filtered.length === 1 && !data.rateId)
          onChange({ ...data, rateId: filtered[0].id })
      })
      .catch(() => setRates([]))
      .finally(() => setLoadingRates(false))
  }, [data.state, data.type]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar sucursales cuando cambia la provincia en modo agency
  useEffect(() => {
    if (data.type !== 'agency' || !data.state) { setAgencies([]); return }
    setLoadingAgencies(true)
    setAgencyError('')
    fetch(`/api/shipping/agencies?province=${data.state}&delivers=true`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((result: Agency[] | { agencies: Agency[]; error?: string }) => {
        const list = Array.isArray(result) ? result : result.agencies ?? []
        setAgencies(list)
        if (!Array.isArray(result) && result.error)
          setAgencyError('No se pudieron cargar las sucursales en este momento')
      })
      .catch(() => setAgencyError('Error al cargar sucursales. Intentá de nuevo.'))
      .finally(() => setLoadingAgencies(false))
  }, [data.state, data.type])

  const set = (partial: Partial<DeliveryData>) => onChange({ ...data, ...partial })

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-gray-800">¿Cómo recibís tu pedido?</h2>

      {/* Opciones de entrega */}
      <div className="space-y-2">
        {[
          { value: 'pickup_store' as DeliveryType, label: 'Retiro en tienda', desc: 'Sin costo · coordinamos por WhatsApp', Icon: Store },
          { value: 'homeDelivery' as DeliveryType, label: 'Envío a domicilio', desc: 'Correo Argentino a tu dirección', Icon: MapPin },
          { value: 'agency' as DeliveryType,       label: 'Retiro en sucursal', desc: 'Retiro en una sucursal de Correo Argentino', Icon: Building2 },
        ].map(({ value, label, desc, Icon }) => (
          <button key={value} onClick={() => set({ type: value, rateId: null, agencyId: '', agencyName: '' })}
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

      {/* Formulario según tipo de entrega */}
      {data.type === 'homeDelivery' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Dirección de envío</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Provincia <span className="text-red-500">*</span></label>
              <select value={data.state} onChange={e => set({ state: e.target.value, rateId: null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                <option value="">Seleccioná</option>
                {PAQAR_PROVINCES.map(p => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Código postal <span className="text-red-500">*</span></label>
              <input type="text" value={data.zipCode} onChange={e => set({ zipCode: e.target.value })}
                placeholder="ej: 1425"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Calle <span className="text-red-500">*</span></label>
              <input type="text" value={data.streetName} onChange={e => set({ streetName: e.target.value })}
                placeholder="Av. Corrientes"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Número <span className="text-red-500">*</span></label>
              <input type="text" value={data.streetNumber} onChange={e => set({ streetNumber: e.target.value })}
                placeholder="1234"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Piso</label>
              <input type="text" value={data.floor} onChange={e => set({ floor: e.target.value })}
                placeholder="3"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dpto</label>
              <input type="text" value={data.department} onChange={e => set({ department: e.target.value })}
                placeholder="A"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Ciudad / Localidad <span className="text-red-500">*</span></label>
            <input type="text" value={data.cityName} onChange={e => set({ cityName: e.target.value })}
              placeholder="Buenos Aires"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Indicaciones adicionales</label>
            <input type="text" value={data.observation} onChange={e => set({ observation: e.target.value })}
              placeholder="Entre calles, referencias..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          {/* Tarifas */}
          {data.state && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Costo de envío</p>
              {loadingRates ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculando...
                </div>
              ) : rates.length === 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  No hay tarifas disponibles para esta provincia. Consultá por WhatsApp.
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
                        {rate.price === 0 ? 'A consultar' : fmt(rate.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {data.type === 'agency' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Elegí una sucursal</p>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Provincia</label>
            <select value={data.state} onChange={e => set({ state: e.target.value, agencyId: '', agencyName: '', rateId: null })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="">Seleccioná una provincia</option>
              {PAQAR_PROVINCES.map(p => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </div>

          {data.state && (
            loadingAgencies ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando sucursales...
              </div>
            ) : agencyError ? (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {agencyError}
              </div>
            ) : agencies.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No se encontraron sucursales en esta provincia.</p>
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

          {/* Tarifas de retiro en sucursal */}
          {data.state && !loadingAgencies && rates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Tarifa</p>
              {loadingRates ? (
                <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</div>
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
                        {rate.price === 0 ? 'A consultar' : fmt(rate.price)}
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

// ── Step 3 — Resumen y confirmación ──────────────────────────────────────────

function StepSummary({ buyer, delivery, items, shippingCost }: {
  buyer:        BuyerData
  delivery:     DeliveryData
  items:        import('../_context/cart-context').CartItem[]
  shippingCost: number
}) {
  const subtotal = items.reduce((s, i) => s + i.price, 0)
  const total    = subtotal + shippingCost

  const deliveryLabel: Record<DeliveryType, string> = {
    pickup_store: 'Retiro en tienda (gratis)',
    homeDelivery: 'Envío a domicilio',
    agency:       'Retiro en sucursal CA',
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-gray-800">Resumen del pedido</h2>

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
              <p className="text-xs text-gray-500">{item.color !== 'Varios' ? `${item.color} · ` : ''}T.{item.size}</p>
              <p className="text-sm font-bold text-violet-700 mt-0.5">{fmt(item.price)}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t pt-3 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Comprador</span>
          <span className="font-medium text-gray-800">{buyer.name}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>WhatsApp</span>
          <span className="font-medium text-gray-800">+54 {buyer.phone}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Entrega</span>
          <span className="font-medium text-gray-800">{deliveryLabel[delivery.type]}</span>
        </div>
        {delivery.type === 'agency' && delivery.agencyName && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Sucursal</span>
            <span className="font-medium text-gray-800 text-right max-w-[180px]">{delivery.agencyName}</span>
          </div>
        )}
        {delivery.type === 'homeDelivery' && delivery.streetName && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Dirección</span>
            <span className="font-medium text-gray-800 text-right max-w-[180px]">
              {delivery.streetName} {delivery.streetNumber}, {delivery.cityName}
            </span>
          </div>
        )}
      </div>

      <div className="border-t pt-3 space-y-1.5">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span><span>{fmt(subtotal)}</span>
        </div>
        {shippingCost > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Envío</span><span>{fmt(shippingCost)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
          <span>Total</span><span className="text-violet-700">{fmt(total)}</span>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Al continuar serás redirigido a <strong>MercadoPago</strong> para completar el pago
          con tarjeta, débito o transferencia. Una vez acreditado, coordinamos la entrega.
        </p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

const STEPS = ['Tus datos', 'Entrega', 'Confirmar']

export default function CheckoutPage() {
  const router  = useRouter()
  const { items, total: cartTotal } = useCart()

  const [step,     setStep    ] = useState(0)
  const [sending,  setSending ] = useState(false)
  const [error,    setError   ] = useState('')

  const [buyer, setBuyer] = useState<BuyerData>({ name: '', phone: '', email: '' })
  const [delivery, setDelivery] = useState<DeliveryData>({
    type:        'pickup_store',
    rateId:      null,
    agencyId:    '',
    agencyName:  '',
    state:       '',
    streetName:  '', streetNumber: '', floor: '', department: '',
    cityName:    '', zipCode:       '', observation: '',
  })

  // Cargar info del rate seleccionado para mostrar el precio
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null)
  useEffect(() => {
    if (!delivery.rateId) { setSelectedRate(null); return }
    fetch(`/api/shipping/rates`)
      .then(r => r.json())
      .then((rates: ShippingRate[]) => setSelectedRate(rates.find(r => r.id === delivery.rateId) ?? null))
      .catch(() => {})
  }, [delivery.rateId])

  const shippingCost = selectedRate?.price ?? 0
  const total = cartTotal + shippingCost

  // Si el carrito está vacío → volver a la tienda
  useEffect(() => {
    if (items.length === 0) {
      router.replace('/tienda')
    }
  }, [items.length, router])

  // ── Validaciones por step ──────────────────────────────────────────────────
  function validateStep(): string | null {
    if (step === 0) {
      if (!buyer.name.trim())  return 'Ingresá tu nombre completo'
      if (!buyer.phone.trim()) return 'Ingresá tu número de WhatsApp'
      if (buyer.phone.trim().length < 8) return 'El número de teléfono no parece válido'
    }
    if (step === 1) {
      if (delivery.type === 'homeDelivery') {
        if (!delivery.state)        return 'Seleccioná una provincia'
        if (!delivery.streetName.trim()) return 'Ingresá la calle'
        if (!delivery.streetNumber.trim()) return 'Ingresá el número'
        if (!delivery.cityName.trim()) return 'Ingresá la ciudad'
        if (!delivery.zipCode.trim()) return 'Ingresá el código postal'
      }
      if (delivery.type === 'agency') {
        if (!delivery.state)     return 'Seleccioná una provincia'
        if (!delivery.agencyId)  return 'Seleccioná una sucursal de Correo Argentino'
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

  // ── Confirmar pedido ───────────────────────────────────────────────────────
  async function handleConfirm() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setSending(true)

    try {
      const phoneClean = `549${buyer.phone.replace(/\D/g, '').replace(/^0?/, '').replace(/^15/, '')}`

      const body: Record<string, unknown> = {
        items: items.map(i => ({
          variantId:   i.variantId,
          unitPrice:   i.price,
          productName: i.productName,
          variantSku:  i.variantSku,
          color:       i.color,
          size:        i.size,
        })),
        buyerName:  buyer.name.trim(),
        buyerPhone: phoneClean,
        buyerEmail: buyer.email.trim() || undefined,
        deliveryType: delivery.type,
        shippingRateId: delivery.rateId ?? undefined,
        agencyId: delivery.agencyId || undefined,
        address: delivery.type === 'homeDelivery' ? {
          streetName:   delivery.streetName.trim(),
          streetNumber: delivery.streetNumber.trim(),
          floor:        delivery.floor.trim() || undefined,
          department:   delivery.department.trim() || undefined,
          cityName:     delivery.cityName.trim(),
          state:        delivery.state,
          zipCode:      delivery.zipCode.trim(),
          observation:  delivery.observation.trim() || undefined,
        } : undefined,
      }

      const res  = await fetch('/api/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json() as {
        orderId?: number; initPoint?: string; error?: string; outOfStock?: number[]
      }

      if (!res.ok) {
        if (res.status === 422 && data.outOfStock) {
          setError('Algunos productos ya no tienen stock. Revisá el carrito.')
        } else {
          setError(data.error ?? 'Error al confirmar el pedido')
        }
        return
      }

      if (!data.initPoint) {
        setError('Error al crear el pago. Intentá de nuevo.')
        return
      }

      // Redirigir a MercadoPago — el carrito se limpia en /checkout/exito
      window.location.href = data.initPoint

    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setSending(false)
    }
  }

  // ── Render principal ───────────────────────────────────────────────────────
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
            <Link href="/tienda" className="text-gray-500 hover:text-gray-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium">Paso {step + 1} de {STEPS.length}</p>
            <p className="text-sm font-semibold text-gray-900">{STEPS[step]}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <ShoppingCart className="h-4 w-4" />
            <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-violet-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      {/* Resumen mini del carrito (collapsible info) */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-2 text-sm">
          <Package className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="flex-1 text-gray-700">
            {items.length} {items.length === 1 ? 'producto' : 'productos'}
            {items.length > 0 && ` · ${items.map(i => i.productName).slice(0, 2).join(', ')}${items.length > 2 ? '…' : ''}`}
          </span>
          <span className="font-bold text-gray-900">{fmt(cartTotal)}</span>
        </div>
      </div>

      {/* Contenido del step */}
      <main className="max-w-lg mx-auto px-4 py-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          {step === 0 && <StepBuyer data={buyer} onChange={setBuyer} />}
          {step === 1 && <StepDelivery data={delivery} onChange={setDelivery} />}
          {step === 2 && (
            <StepSummary
              buyer={buyer} delivery={delivery}
              items={items} shippingCost={shippingCost}
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

        {/* Botón de avance */}
        <div className="mt-4">
          {step < STEPS.length - 1 ? (
            <button onClick={handleNext}
              className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors shadow-lg shadow-violet-100">
              Continuar
            </button>
          ) : (
            <button onClick={handleConfirm} disabled={sending}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold text-sm transition-colors shadow-lg shadow-violet-100">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {sending ? 'Procesando…' : 'Pagar con MercadoPago'}
            </button>
          )}
        </div>

        {/* Total en el pie del formulario */}
        {delivery.type !== 'pickup_store' && shippingCost > 0 && step > 0 && (
          <p className="text-center text-xs text-gray-400 mt-3">
            Total con envío: <strong className="text-gray-700">{fmt(total)}</strong>
          </p>
        )}
      </main>
    </div>
  )
}
