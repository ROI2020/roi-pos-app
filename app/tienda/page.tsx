"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  ShoppingBag, MapPin, Phone, MessageCircle, Search, SlidersHorizontal, X,
  ChevronDown, ChevronUp, Truck, Store, CreditCard, Banknote, ArrowLeft,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Variant {
  id: number; sku: string; color: string; size: string
  specific_image_url: string | null; in_stock: boolean; stock_count: number
}
interface Product {
  id: number; name: string; description: string | null
  price: number; category: string | null; has_image: boolean
  variants: Variant[]
}
interface Store {
  name: string | null; logo: string | null
  address: string | null; phone: string | null; whatsapp: string | null
  has_banner: boolean; banner_text: string | null; shipping_info: string | null
}
interface CatalogData { store: Store; categories: string[]; products: Product[] }

// ── Paleta de colores en español ───────────────────────────────────────────────
const COLOR_CSS: Record<string, string> = {
  negro: '#111827', 'negro brillante': '#000', blanco: '#f9fafb', 'blanco roto': '#fef9ef',
  rojo: '#dc2626', 'rojo oscuro': '#991b1b', rosa: '#ec4899', 'rosa chicle': '#f472b6',
  'rosa pastel': '#fce7f3', azul: '#2563eb', 'azul marino': '#1e3a8a', celeste: '#7dd3fc',
  'azul cielo': '#38bdf8', verde: '#16a34a', 'verde militar': '#4d7c0f', 'verde agua': '#06b6d4',
  menta: '#6ee7b7', amarillo: '#eab308', 'amarillo mostaza': '#a16207', naranja: '#f97316',
  violeta: '#7c3aed', lila: '#c084fc', 'lila pastel': '#ede9fe', gris: '#9ca3af',
  'gris oscuro': '#374151', 'gris claro': '#e5e7eb', beige: '#d4b896', crema: '#fef3c7',
  bordo: '#881337', 'bordo oscuro': '#4c0519', salmon: '#fb7185', terracota: '#b45309',
  'color carne': '#d4a574', chocolate: '#6b3a2a', camel: '#c19a6b',
}

function colorToCss(name: string): string | null {
  if (!name) return null
  const k = name.toLowerCase().trim()
  if (k === 'varios') return null
  return COLOR_CSS[k] ?? null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const SIZE_ORDER = ['XS','S','M','L','XL','XXL','XXXL','X','U','TU','00','0','1','2','3','4','5','6','7','8','9',
  '10','11','12','13','14','15','16','17','18','19','20','22','24','26','28','30','32','34','36','38','40']

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a); const ib = SIZE_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1; if (ib !== -1) return 1
    return a.localeCompare(b, 'es', { numeric: true })
  })
}

function totalStock(product: Product): number {
  return product.variants.reduce((acc, v) => acc + v.stock_count, 0)
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal de detalle de producto
// ══════════════════════════════════════════════════════════════════════════════
function ProductModal({
  product, store, allProducts, onClose,
}: {
  product: Product
  store: Store
  allProducts: Product[]
  onClose: () => void
}) {
  const colors = [...new Set(product.variants.map(v => v.color))]
  const [selColor, setSelColor] = useState<string>(colors[0] ?? '')
  const [selSize,  setSelSize ] = useState<string>('')
  const [imgKey,   setImgKey  ] = useState(0)
  const [localidad, setLocalidad] = useState('')
  const [cp,        setCp       ] = useState('')

  const variantsForColor = product.variants.filter(v => v.color === selColor)
  const sizes = sortSizes([...new Set(variantsForColor.map(v => v.size))])
  const inStockSizes = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))

  const selectedVariant = variantsForColor.find(v => v.size === selSize) ?? null
  const stockTotal = totalStock(product)
  const isUltimasUnidades = stockTotal > 0 && stockTotal <= 3

  const variantImg = variantsForColor[0]?.specific_image_url
  const imgSrc = variantImg ?? (product.has_image ? `/api/images/products/${product.id}` : null)

  const singleSize = sizes.length === 1 && sizes[0] === 'X'

  // Auto-select size if only one option
  useEffect(() => {
    if (singleSize) setSelSize(sizes[0])
    else setSelSize('')
  }, [selColor]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleColorChange = (color: string) => {
    setSelColor(color)
    setImgKey(k => k + 1)
  }

  const buildWaMessage = (includeEnvio = false) => {
    let msg = `Hola! Me interesa: *${product.name}*`
    if (selColor && selColor.toLowerCase() !== 'varios') msg += `\nColor: ${selColor}`
    if (selSize && selSize !== 'X') msg += `\nTalle: ${selSize}`
    msg += `\nPrecio: ${fmt(product.price)}`
    if (includeEnvio && localidad) {
      msg += `\n\n¿Cuánto saldría el envío a ${localidad}${cp ? `, CP ${cp}` : ''}?`
    }
    return msg
  }

  const waBase = store.whatsapp
    ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(buildWaMessage())}`
    : null

  const waEnvio = (store.whatsapp && localidad)
    ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(buildWaMessage(true))}`
    : null

  // Cerrar con Escape + lock scroll
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const related = allProducts
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 8)

  const canBuy = product.variants.some(v => v.in_stock) &&
    (singleSize || (selSize && inStockSizes.has(selSize)))

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-lg bg-white flex flex-col h-full overflow-hidden shadow-2xl">

        {/* Sticky top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white/95 backdrop-blur-sm shrink-0 z-10">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          {product.category && (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
              {product.category}
            </span>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-24">

          {/* Imagen */}
          <div className="relative bg-gray-100 aspect-[4/3]">
            {imgSrc ? (
              <img
                key={imgKey}
                src={imgSrc}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-pink-100">
                <span className="text-7xl font-bold text-violet-300 select-none">
                  {product.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {isUltimasUnidades && (
              <div className="absolute top-3 left-3">
                <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white shadow animate-pulse">
                  <AlertTriangle className="h-3 w-3" />
                  ¡Últimas unidades!
                </span>
              </div>
            )}
          </div>

          <div className="px-5 py-4 space-y-5">

            {/* Nombre + precio */}
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{product.name}</h1>
              <p className="text-3xl font-bold text-violet-700 mt-1">{fmt(product.price)}</p>
              {product.description && (
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{product.description}</p>
              )}
            </div>

            {/* Selector de color */}
            {colors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Color
                  {selColor && selColor.toLowerCase() !== 'varios' && (
                    <span className="ml-2 font-medium text-violet-600 normal-case">{selColor}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {colors.map(color => {
                    const css = colorToCss(color)
                    const isVarios = color.toLowerCase() === 'varios'
                    const isSel = selColor === color
                    const hasStock = product.variants.some(v => v.color === color && v.in_stock)
                    return (
                      <button
                        key={color}
                        title={color}
                        onClick={() => handleColorChange(color)}
                        className={`relative w-9 h-9 rounded-full border-[3px] transition-all duration-150 focus:outline-none
                          ${isSel ? 'border-violet-500 scale-110 shadow-lg' : 'border-gray-200 hover:border-gray-400'}
                          ${!hasStock ? 'opacity-40' : ''}
                        `}
                        style={isVarios
                          ? { background: 'linear-gradient(135deg, #f472b6, #818cf8, #34d399)' }
                          : { backgroundColor: css ?? '#e5e7eb' }
                        }
                      >
                        {!hasStock && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="block w-7 h-px bg-gray-400 rotate-45" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Selector de talle */}
            {!singleSize && sizes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Talle
                  {selSize && <span className="ml-2 font-medium text-violet-600 normal-case">{selSize}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(size => {
                    const inStock = inStockSizes.has(size)
                    const isSel = selSize === size
                    return (
                      <button
                        key={size}
                        onClick={() => inStock && setSelSize(isSel ? '' : size)}
                        disabled={!inStock}
                        className={`min-w-[44px] px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-all
                          ${isSel
                            ? 'border-violet-600 bg-violet-600 text-white shadow'
                            : inStock
                              ? 'border-gray-300 text-gray-700 hover:border-violet-400 bg-white'
                              : 'border-gray-100 text-gray-300 bg-gray-50 line-through cursor-not-allowed'
                          }`}
                      >
                        {size}
                      </button>
                    )
                  })}
                </div>
                {!selSize && (
                  <p className="text-xs text-amber-600">Seleccioná un talle para continuar</p>
                )}
              </div>
            )}

            <div className="border-t border-gray-100" />

            {/* Medios de pago */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Medios de pago</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <Banknote className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Efectivo / Transferencia</p>
                    <p className="text-xs text-gray-500">Precio de lista</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Tarjetas de crédito</p>
                    <p className="text-xs font-semibold text-blue-600">3 cuotas sin interés</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Envíos y retiro */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Envío y retiro</p>

              {store.shipping_info ? (
                <div className="space-y-1.5">
                  {store.shipping_info.split('\n').filter(l => l.trim()).map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <Truck className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                      <span>{line.trim()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Store className="h-4 w-4 shrink-0" />
                  <span>Consultá opciones de envío y retiro por WhatsApp</span>
                </div>
              )}

              {/* Formulario calcular envío */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Calculá el costo de envío</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ciudad / Localidad"
                    value={localidad}
                    onChange={e => setLocalidad(e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="CP"
                    value={cp}
                    onChange={e => setCp(e.target.value)}
                    className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                  />
                </div>
                {waEnvio ? (
                  <a
                    href={waEnvio}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Consultar costo por WhatsApp
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 text-center">
                    Ingresá tu localidad para consultar el costo
                  </p>
                )}
              </div>
            </div>

            {/* Productos relacionados */}
            {related.length > 0 && (
              <>
                <div className="border-t border-gray-100" />
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    También te puede gustar
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-none">
                    {related.map(rel => {
                      const relStock = rel.variants.some(v => v.in_stock)
                      const relImg = rel.variants[0]?.specific_image_url ??
                        (rel.has_image ? `/api/images/products/${rel.id}` : null)
                      return (
                        <button
                          key={rel.id}
                          onClick={() => {
                            onClose()
                            setTimeout(() => {
                              document.dispatchEvent(new CustomEvent('open-product', { detail: rel }))
                            }, 50)
                          }}
                          className="flex-none w-32 rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow text-left"
                        >
                          <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
                            {relImg ? (
                              <img src={relImg} alt={rel.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-50 to-pink-50">
                                <span className="text-2xl font-bold text-violet-200">
                                  {rel.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{rel.name}</p>
                            <p className="text-xs font-bold text-violet-700 mt-1">{fmt(rel.price)}</p>
                            {!relStock && (
                              <p className="text-[10px] text-gray-400">Sin stock</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sticky bottom CTA */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t">
          {waBase ? (
            <a
              href={waBase}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-base font-bold transition-colors
                ${canBuy
                  ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-200'
                  : 'bg-gray-100 text-gray-400 pointer-events-none'
                }`}
            >
              <MessageCircle className="h-5 w-5" />
              {canBuy ? 'Consultar por WhatsApp' : (!product.variants.some(v => v.in_stock) ? 'Sin stock' : 'Elegí un talle')}
            </a>
          ) : (
            <div className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-base font-bold
              ${product.variants.some(v => v.in_stock) ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}>
              <ShoppingBag className="h-5 w-5" />
              {product.variants.some(v => v.in_stock) ? 'Disponible' : 'Sin stock'}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tarjeta de producto
// ══════════════════════════════════════════════════════════════════════════════
function ProductCard({
  product, waNumber, onSelect,
}: {
  product: Product
  waNumber: string | null
  onSelect: () => void
}) {
  const colors = [...new Set(product.variants.map(v => v.color))]
  const [selColor, setSelColor] = useState<string>(colors[0] ?? '')
  const [imgKey,   setImgKey  ] = useState(0)
  const [descExpanded, setDescExpanded] = useState(false)

  const variantsForColor = product.variants.filter(v => v.color === selColor)
  const sizes = sortSizes([...new Set(variantsForColor.map(v => v.size))])
  const inStockSizes = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))
  const anyInStock = product.variants.some(v => v.in_stock)
  const stockTotal = totalStock(product)
  const isUltimasUnidades = stockTotal > 0 && stockTotal <= 3

  const variantImg = variantsForColor[0]?.specific_image_url
  const imgSrc = variantImg ?? (product.has_image ? `/api/images/products/${product.id}` : null)

  const longDesc = (product.description?.length ?? 0) > 80

  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hola! Me interesa: *${product.name}*${selColor && selColor !== 'Varios' ? ` — Color: ${selColor}` : ''} — Precio: ${fmt(product.price)}`
      )}`
    : null

  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 flex flex-col">

      {/* Imagen — clickeable */}
      <div
        className="relative aspect-[3/4] bg-gray-100 overflow-hidden cursor-pointer"
        onClick={onSelect}
      >
        {imgSrc ? (
          <img
            key={imgKey}
            src={imgSrc}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-pink-100">
            <span className="text-5xl font-bold text-violet-300 select-none">
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {anyInStock && isUltimasUnidades && (
          <div className="absolute top-2.5 left-2.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white shadow-sm animate-pulse">
              ¡Últimas!
            </span>
          </div>
        )}
        {!anyInStock && (
          <div className="absolute top-2.5 left-2.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-400 text-white shadow-sm">
              Sin stock
            </span>
          </div>
        )}

        {product.category && (
          <div className="absolute top-2.5 right-2.5">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 shadow-sm">
              {product.category}
            </span>
          </div>
        )}

        {/* Overlay "Ver detalles" */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-end justify-center pb-3">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold bg-black/60 px-3 py-1 rounded-full">
            Ver detalles
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">

        {/* Nombre — clickeable */}
        <div className="cursor-pointer" onClick={onSelect}>
          <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 hover:text-violet-700 transition-colors">
            {product.name}
          </h3>
          {product.description && (
            <div>
              <p className={`text-xs text-gray-400 mt-0.5 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
                {product.description}
              </p>
              {longDesc && (
                <button
                  className="text-[11px] text-violet-500 hover:text-violet-700 font-medium mt-0.5"
                  onClick={e => { e.stopPropagation(); setDescExpanded(v => !v) }}
                >
                  {descExpanded ? 'Ver menos' : 'Ver más'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Precio */}
        <p className="text-xl font-bold text-gray-900 tracking-tight">{fmt(product.price)}</p>

        {/* Círculos de color */}
        {colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {colors.map(color => {
              const css = colorToCss(color)
              const isVarios = color.toLowerCase() === 'varios'
              const isSel = selColor === color
              const hasStock = product.variants.some(v => v.color === color && v.in_stock)
              return (
                <button
                  key={color}
                  title={color}
                  onClick={() => { setSelColor(color); setImgKey(k => k + 1) }}
                  className={`relative w-6 h-6 rounded-full border-2 transition-all duration-150 focus:outline-none
                    ${isSel ? 'border-violet-500 scale-110 shadow-md' : 'border-transparent hover:border-gray-300 hover:scale-105'}
                    ${!hasStock ? 'opacity-40' : ''}
                  `}
                  style={isVarios
                    ? { background: 'linear-gradient(135deg, #f472b6, #818cf8, #34d399)' }
                    : { backgroundColor: css ?? '#e5e7eb' }
                  }
                >
                  {!hasStock && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="block w-5 h-px bg-gray-400 rotate-45" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {selColor && selColor.toLowerCase() !== 'varios' && (
          <p className="text-xs text-gray-500 -mt-0.5">Color: <span className="font-medium text-gray-700">{selColor}</span></p>
        )}

        {/* Talles */}
        {sizes.length > 0 && !(sizes.length === 1 && sizes[0] === 'X') && (
          <div className="flex flex-wrap gap-1">
            {sizes.map(size => {
              const inStock = inStockSizes.has(size)
              return (
                <span
                  key={size}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border
                    ${inStock ? 'border-gray-300 text-gray-700 bg-white' : 'border-gray-200 text-gray-300 line-through bg-gray-50'}`}
                >
                  T.{size}
                </span>
              )
            })}
          </div>
        )}

        {/* Botones */}
        <div className="mt-auto pt-1 flex gap-2">
          <button
            onClick={onSelect}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors"
          >
            Ver detalles
          </button>
          {waHref && anyInStock && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Página principal
// ══════════════════════════════════════════════════════════════════════════════
export default function TiendaPage() {
  const [data,           setData          ] = useState<CatalogData | null>(null)
  const [loading,        setLoading       ] = useState(true)
  const [selCategory,    setSelCategory   ] = useState<string>('__all__')
  const [inStockOnly,    setInStockOnly   ] = useState(false)
  const [search,         setSearch        ] = useState('')
  const [filtersOpen,    setFiltersOpen   ] = useState(false)
  const [selectedProduct,setSelectedProduct] = useState<Product | null>(null)

  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('msg') === 'no_account') {
      toast.info('Tu cuenta de Google no está registrada en el sistema', {
        description: (
          <span>
            Para solicitar acceso contactá a ROISOL:{' '}
            <a href="https://wa.me/541131005865" target="_blank" rel="noopener noreferrer" className="underline font-medium">
              WhatsApp →
            </a>
          </span>
        ),
        duration: 10000,
      })
    }
  }, [])

  // Listener para apertura desde productos relacionados
  useEffect(() => {
    const handler = (e: CustomEvent<Product>) => setSelectedProduct(e.detail)
    document.addEventListener('open-product', handler as EventListener)
    return () => document.removeEventListener('open-product', handler as EventListener)
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.products.filter(p => {
      if (selCategory !== '__all__' && p.category !== selCategory) return false
      if (inStockOnly && !p.variants.some(v => v.in_stock)) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q)
          || (p.description?.toLowerCase().includes(q) ?? false)
          || (p.category?.toLowerCase().includes(q) ?? false)
      }
      return true
    })
  }, [data, selCategory, inStockOnly, search])

  const store = data?.store

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Modal de producto */}
      {selectedProduct && data && (
        <ProductModal
          product={selectedProduct}
          store={data.store}
          allProducts={data.products}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* ── Hero / Header ──────────────────────────────────────────────────── */}
      <header className="bg-white border-b relative">
        <a
          href="/login"
          className="absolute top-3 right-4 text-xs text-gray-400 hover:text-violet-600 transition-colors flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Acceder al sistema
        </a>
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col items-center gap-3">
          {store?.logo ? (
            <img src={store.logo} alt={store.name ?? 'Logo'} className="h-16 object-contain" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
              <ShoppingBag className="h-8 w-8 text-white" />
            </div>
          )}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">{store?.name ?? 'Tienda'}</h1>
            {store?.address && (
              <p className="text-sm text-gray-400 flex items-center justify-center gap-1 mt-0.5">
                <MapPin className="h-3.5 w-3.5" />{store.address}
              </p>
            )}
          </div>
          {(store?.phone || store?.whatsapp) && (
            <div className="flex items-center gap-3 text-sm">
              {store.phone && (
                <a href={`tel:${store.phone}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
                  <Phone className="h-3.5 w-3.5" />{store.phone}
                </a>
              )}
              {store.whatsapp && (
                <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-green-600 hover:text-green-700 font-medium">
                  <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Banner ────────────────────────────────────────────────────────── */}
      {store?.has_banner && (
        <div className="w-full overflow-hidden" style={{ aspectRatio: '3/1', maxHeight: '400px' }}>
          <img src="/api/images/banner" alt="Banner de la tienda" className="w-full h-full object-cover" />
        </div>
      )}

      {store?.banner_text && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-1.5">
              {store.banner_text.split('\n').filter(l => l.trim()).map((line, i) => (
                <span key={i} className="text-sm text-gray-700 whitespace-pre">{line.trim()}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Barra de filtros ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar productos…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1">
            {[{ label: 'Todo', val: '__all__' }, ...(data?.categories ?? []).map(c => ({ label: c, val: c }))].map(({ label, val }) => (
              <button
                key={val}
                onClick={() => setSelCategory(val)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0
                  ${selCategory === val ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setInStockOnly(v => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${inStockOnly ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              En stock
            </button>
            <button
              className="sm:hidden flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
              onClick={() => setFiltersOpen(v => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {filtersOpen && (
          <div className="sm:hidden px-4 pb-3 flex flex-wrap gap-1.5">
            {[{ label: 'Todo', val: '__all__' }, ...(data?.categories ?? []).map(c => ({ label: c, val: c }))].map(({ label, val }) => (
              <button
                key={val}
                onClick={() => { setSelCategory(val); setFiltersOpen(false) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${selCategory === val ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Grid de productos ──────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {!loading && (
          <p className="text-sm text-gray-400 mb-5">
            {filtered.length === 0
              ? 'No hay productos que coincidan'
              : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
            {selCategory !== '__all__' && ` en ${selCategory}`}
            {search && ` · "${search}"`}
          </p>
        )}

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white shadow-sm animate-pulse">
                <div className="aspect-[3/4] bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-6 bg-gray-200 rounded w-1/3" />
                  <div className="flex gap-1.5">{[1,2,3].map(j => <div key={j} className="w-6 h-6 rounded-full bg-gray-200" />)}</div>
                  <div className="h-9 bg-gray-200 rounded-xl mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                waNumber={store?.whatsapp ?? null}
                onSelect={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300 gap-3">
            <ShoppingBag className="h-14 w-14" />
            <p className="text-base text-gray-400">No hay productos disponibles</p>
            {(selCategory !== '__all__' || inStockOnly || search) && (
              <button
                className="text-sm text-violet-500 hover:text-violet-700"
                onClick={() => { setSelCategory('__all__'); setInStockOnly(false); setSearch('') }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t bg-white mt-12 py-10">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-6">
          <div className="space-y-1">
            <p className="font-semibold text-gray-700">{store?.name}</p>
            {store?.address && <p className="text-sm text-gray-400">{store.address}</p>}
            {store?.phone   && <p className="text-sm text-gray-400">{store.phone}</p>}
          </div>
          <div className="space-y-3">
            <p className="text-sm text-gray-500 font-medium">¡No te pierdas las novedades!</p>
            <div className="flex items-center justify-center gap-5">
              <a href="https://instagram.com/malema.ba" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="Instagram @malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://facebook.com/malema.ba" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="Facebook malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="https://tiktok.com/@malema.ba" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="TikTok @malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg>
              </a>
              <a href="https://youtube.com/@MALEMA.STOREBA" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="YouTube @MALEMA.STOREBA">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>
          </div>
          <div>
            <a href="mailto:malema.store.ba@gmail.com?subject=CV - Quiero trabajar con ustedes"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              ¿Querés trabajar con nosotros? ¡Mandanos tu CV!
            </a>
          </div>
          <p className="text-xs text-gray-300">Todos los precios en pesos argentinos. Stock sujeto a disponibilidad.</p>
        </div>
      </footer>
    </div>
  )
}
