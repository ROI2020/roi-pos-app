"use client"

import React, { useState, useEffect } from "react"
import {
  MessageCircle, ArrowLeft, AlertTriangle,
  Banknote, CreditCard, Truck, Store as StoreIcon,
  Sparkles, TrendingUp, ShoppingCart, Check,
} from "lucide-react"
import type { Product, StoreData, SuggestionProduct } from '../_types'
import { colorToCss, fmt, sortSizes, totalStock } from '../_utils'
import { useCart } from '../_context/cart-context'

const SUGGESTION_ICON: Record<SuggestionProduct['reason'], React.ReactNode> = {
  complementary: <Sparkles className="h-3.5 w-3.5 text-violet-500" />,
  trending:      <TrendingUp className="h-3.5 w-3.5 text-orange-500" />,
}
const SUGGESTION_TEXT: Record<SuggestionProduct['reason'], string> = {
  complementary: 'Para combinar',
  trending:      'Lo más vendido',
}

export default function ProductModal({
  product, store, allProducts, onClose,
}: {
  product:     Product
  store:       StoreData
  allProducts: Product[]
  onClose:     () => void
}) {
  // Solo colores con al menos un talle en stock
  const colors = [...new Set(product.variants.filter(v => v.in_stock).map(v => v.color))]
  const [selColor,  setSelColor ] = useState<string>(colors[0] ?? '')
  const [selSize,   setSelSize  ] = useState<string>('')
  const [imgKey,    setImgKey   ] = useState(0)
  const [localidad,   setLocalidad  ] = useState('')
  const [cp,          setCp         ] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestionProduct[]>([])
  const [added,       setAdded      ] = useState(false)

  const { addItem, items: cartItems, openCart } = useCart()

  const variantsForColor = product.variants.filter(v => v.color === selColor)
  const sizes        = sortSizes([...new Set(variantsForColor.map(v => v.size))])
  const inStockSizes = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))
  const stockTotal   = totalStock(product)
  const isUltimas    = stockTotal > 0 && stockTotal <= 3
  const singleSize   = sizes.length === 1 && sizes[0] === 'X'

  const variantImg  = variantsForColor[0]?.specific_image_url
  const colorImgId  = product.images_by_color[selColor]
  // Prioridad: foto de color → specific_image_url de variante → foto principal
  const imgSrc = colorImgId != null
    ? `/api/images/product-images/${colorImgId}`
    : variantImg ?? (product.has_image ? `/api/images/products/${product.id}` : null)

  // Auto-seleccionar talle único
  useEffect(() => {
    if (singleSize) setSelSize(sizes[0])
    else setSelSize('')
  }, [selColor]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Sugerencias inteligentes
  useEffect(() => {
    setSuggestions([])
    const qs = new URLSearchParams({ exclude: String(product.id), limit: '8' })
    if (product.category) qs.set('category', product.category)
    fetch(`/api/catalog/suggestions?${qs}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setSuggestions(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [product.id, product.category])

  const handleColorChange = (color: string) => { setSelColor(color); setImgKey(k => k + 1) }

  const buildWaMsg = (includeEnvio = false) => {
    let msg = `Hola! Me interesa: *${product.name}*`
    if (selColor && selColor.toLowerCase() !== 'varios') msg += `\nColor: ${selColor}`
    if (selSize && selSize !== 'X') msg += `\nTalle: ${selSize}`
    msg += `\nPrecio: ${fmt(product.price)}`
    if (includeEnvio && localidad)
      msg += `\n\n¿Cuánto saldría el envío a ${localidad}${cp ? `, CP ${cp}` : ''}?`
    return msg
  }

  const waBase  = store.whatsapp
    ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(buildWaMsg())}`
    : null
  const waEnvio = store.whatsapp && localidad
    ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(buildWaMsg(true))}`
    : null

  const canBuy = product.variants.some(v => v.in_stock) &&
    (singleSize || Boolean(selSize && inStockSizes.has(selSize)))

  // Variante seleccionada (por color + talle)
  const selectedVariant = variantsForColor.find(v =>
    singleSize ? v.in_stock : v.size === selSize && v.in_stock
  )

  // Si el variant ya está en el carrito
  const alreadyInCart = selectedVariant
    ? cartItems.some(i => i.variantId === selectedVariant.id)
    : false

  const effectivePrice = product.promo_price ?? product.price

  const handleAddToCart = () => {
    if (!selectedVariant || !canBuy) return
    if (alreadyInCart) { onClose(); openCart(); return }
    addItem({
      variantId:        selectedVariant.id,
      productId:        product.id,
      productName:      product.name,
      variantSku:       selectedVariant.sku,
      color:            selColor,
      size:             selectedVariant.size,
      specificImageUrl: selectedVariant.specific_image_url,
      hasImage:         product.has_image,
      price:            effectivePrice,
      cuotas:           product.cuotas,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-lg bg-white flex flex-col h-full overflow-hidden shadow-2xl">

        {/* Top bar */}
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

        {/* Scroll */}
        <div className="flex-1 overflow-y-auto pb-24">

          {/* Imagen */}
          <div className="relative bg-gray-100 aspect-[4/3]">
            {imgSrc ? (
              <img key={imgKey} src={imgSrc} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-pink-100">
                <span className="text-7xl font-bold text-violet-300 select-none">
                  {product.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {isUltimas && (
              <div className="absolute top-3 left-3">
                <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white shadow animate-pulse">
                  <AlertTriangle className="h-3 w-3" /> ¡Últimas unidades!
                </span>
              </div>
            )}
          </div>

          <div className="px-5 py-4 space-y-5">

            {/* Nombre + precio */}
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{product.name}</h1>

              {product.today_promo && product.promo_price != null ? (
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-bold text-violet-700">{fmt(product.promo_price)}</span>
                    <span className="text-lg text-gray-400 line-through">{fmt(product.price)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-sm w-fit">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">SOLO x HOY</span>
                    <span className="text-[11px] font-bold leading-tight">{product.today_promo}</span>
                  </div>
                  <p className="text-sm font-semibold text-violet-600">
                    Queda en {fmt(product.promo_price)}
                  </p>
                </div>
              ) : (
                <p className="text-3xl font-bold text-violet-700 mt-1">{fmt(product.price)}</p>
              )}

              {product.cuotas > 0 && (
                <p className="text-sm text-gray-500 mt-1.5">
                  mismo precio en {product.cuotas} cuotas de{' '}
                  <span className="font-semibold text-gray-700">
                    {fmt(Math.round((product.promo_price ?? product.price) / product.cuotas))}
                  </span>
                </p>
              )}

              {product.description && (
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{product.description}</p>
              )}
            </div>

            {/* Colores */}
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
                    const css     = colorToCss(color)
                    const isVarios = color.toLowerCase() === 'varios'
                    const isSel   = selColor === color
                    const hasStock = product.variants.some(v => v.color === color && v.in_stock)
                    return (
                      <button key={color} title={color} onClick={() => handleColorChange(color)}
                        className={`relative w-9 h-9 rounded-full border-[3px] transition-all duration-150 focus:outline-none
                          ${isSel ? 'border-violet-500 scale-110 shadow-lg' : 'border-gray-200 hover:border-gray-400'}
                          ${!hasStock ? 'opacity-40' : ''}`}
                        style={isVarios
                          ? { background: 'linear-gradient(135deg,#f472b6,#818cf8,#34d399)' }
                          : { backgroundColor: css ?? '#e5e7eb' }}
                      >
                        {!hasStock && <span className="absolute inset-0 flex items-center justify-center"><span className="block w-7 h-px bg-gray-400 rotate-45" /></span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Talles */}
            {!singleSize && sizes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Talle {selSize && <span className="ml-2 font-medium text-violet-600 normal-case">{selSize}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(size => {
                    const inStock = inStockSizes.has(size); const isSel = selSize === size
                    return (
                      <button key={size} onClick={() => inStock && setSelSize(isSel ? '' : size)} disabled={!inStock}
                        className={`min-w-[44px] px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-all
                          ${isSel ? 'border-violet-600 bg-violet-600 text-white shadow'
                            : inStock ? 'border-gray-300 text-gray-700 hover:border-violet-400 bg-white'
                            : 'border-gray-100 text-gray-300 bg-gray-50 line-through cursor-not-allowed'}`}
                      >{size}</button>
                    )
                  })}
                </div>
                {!selSize && <p className="text-xs text-amber-600">Seleccioná un talle para continuar</p>}
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
                {product.cuotas > 0 && (
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Tarjetas de crédito</p>
                      <p className="text-xs font-semibold text-blue-600">
                        {product.cuotas} cuota{product.cuotas !== 1 ? 's' : ''} sin interés de{' '}
                        {fmt(Math.round((product.promo_price ?? product.price) / product.cuotas))}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Envíos */}
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
                  <StoreIcon className="h-4 w-4 shrink-0" />
                  <span>Consultá opciones de envío y retiro por WhatsApp</span>
                </div>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Calculá el costo de envío</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="Ciudad / Localidad" value={localidad}
                    onChange={e => setLocalidad(e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
                  <input type="text" placeholder="CP" value={cp}
                    onChange={e => setCp(e.target.value)}
                    className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
                </div>
                {waEnvio ? (
                  <a href={waEnvio} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors">
                    <MessageCircle className="h-4 w-4" /> Consultar costo por WhatsApp
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 text-center">Ingresá tu localidad para consultar el costo</p>
                )}
              </div>
            </div>

            {/* Sugerencias */}
            {suggestions.length > 0 && (
              <>
                <div className="border-t border-gray-100" />
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                    {SUGGESTION_ICON[suggestions[0].reason]}
                    {SUGGESTION_TEXT[suggestions[0].reason]}
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-none">
                    {suggestions.map(sug => {
                      const sugImg = sug.specific_image_url ?? (sug.has_image ? `/api/images/products/${sug.id}` : null)
                      return (
                        <button key={sug.id}
                          onClick={() => {
                            const full = allProducts.find(p => p.id === sug.id)
                            if (!full) return
                            onClose()
                            setTimeout(() => document.dispatchEvent(new CustomEvent('open-product', { detail: full })), 50)
                          }}
                          className="flex-none w-32 rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow text-left"
                        >
                          <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
                            {sugImg
                              ? <img src={sugImg} alt={sug.name} className="w-full h-full object-cover" loading="lazy" />
                              : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-50 to-pink-50">
                                  <span className="text-2xl font-bold text-violet-200">{sug.name.charAt(0).toUpperCase()}</span>
                                </div>
                            }
                          </div>
                          <div className="p-2">
                            {sug.category && <p className="text-[9px] text-violet-500 font-medium uppercase tracking-wide mb-0.5 truncate">{sug.category}</p>}
                            <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{sug.name}</p>
                            <p className="text-xs font-bold text-violet-700 mt-1">{fmt(sug.price)}</p>
                            {sug.stock_total === 0 && <p className="text-[10px] text-gray-400">Sin stock</p>}
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

        {/* CTA fijo */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t space-y-2">

          {/* Botón primario: Agregar al carrito */}
          {product.variants.some(v => v.in_stock) ? (
            <button onClick={handleAddToCart}
              disabled={!canBuy && !alreadyInCart}
              className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-base font-bold transition-all
                ${alreadyInCart
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : canBuy
                    ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {alreadyInCart
                ? <><Check className="h-5 w-5" /> En el carrito — ver</>
                : canBuy
                  ? <><ShoppingCart className="h-5 w-5" />{added ? '¡Agregado!' : 'Agregar al carrito'}</>
                  : <><ShoppingCart className="h-5 w-5" />Elegí un talle</>}
            </button>
          ) : (
            <div className="flex items-center justify-center w-full py-3.5 rounded-xl text-base font-bold bg-gray-100 text-gray-400">
              Sin stock
            </div>
          )}

          {/* Botón secundario: WhatsApp */}
          {waBase && product.variants.some(v => v.in_stock) && (
            <a href={waBase} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold border border-green-200 text-green-600 hover:bg-green-50 transition-colors">
              <MessageCircle className="h-4 w-4" />
              Consultar por WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
