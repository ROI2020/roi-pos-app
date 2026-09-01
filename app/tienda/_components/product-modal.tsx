"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from 'next-intl'
import {
  MessageCircle, ArrowLeft, AlertTriangle,
  Banknote, CreditCard, Truck, Store as StoreIcon,
  ShoppingCart, Check,
} from "lucide-react"
import type { Product, StoreData, SuggestionProduct } from '../_types'
import { colorToCss, sortSizes, totalStock } from '../_utils'
import { useCart }     from '../_context/cart-context'
import { useCurrency } from '../_context/currency-context'

const SUGGESTION_ICON: Record<SuggestionProduct['reason'], React.ReactNode> = {
  complementary: <span className="store-text-primary">✦</span>,
  trending:      <span className="text-orange-500">↑</span>,
}

export default function ProductModal({
  product, store, allProducts, onClose,
}: {
  product:     Product
  store:       StoreData
  allProducts: Product[]
  onClose:     () => void
}) {
  const { fmt } = useCurrency()
  const t = useTranslations('ProductModal')

  // Solo colores con al menos un talle en stock; filtramos string vacío (sin color diferenciado)
  const colors = [...new Set(product.variants.filter(v => v.in_stock).map(v => v.color).filter(c => c))]
  const [selColor,    setSelColor   ] = useState<string>(colors[0] ?? '')
  const [selSize,     setSelSize    ] = useState<string>('')
  const [imgKey,      setImgKey     ] = useState(0)
  const [galIdx,      setGalIdx     ] = useState(0)    // índice activo en la galería CJ
  const [localidad,   setLocalidad  ] = useState('')
  const [cp,          setCp         ] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestionProduct[]>([])
  const [added,       setAdded      ] = useState(false)

  const { addItem, items: cartItems, openCart } = useCart()

  const variantsForColor = selColor
    ? product.variants.filter(v => v.color === selColor)
    : product.variants
  const sizes        = sortSizes([...new Set(variantsForColor.map(v => v.size).filter(s => s))])
  const inStockSizes = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))
  const stockTotal   = totalStock(product)
  const isUltimas    = stockTotal > 0 && stockTotal <= 3
  // singleSize: ocultar selector si solo hay un talle 'X' (legado) o ninguno
  const singleSize   = sizes.length === 0 || (sizes.length === 1 && sizes[0] === 'X')

  const variantImg  = variantsForColor[0]?.specific_image_url
  const colorImgId  = product.images_by_color[selColor]

  // Si hay galería CJ, la usamos con control de índice propio
  const hasGallery = product.gallery.length > 1
  // Prioridad: galería CJ activa → foto de color (local) → specific_image_url (proxied) →
  //            image_url (proxied CDN principal) → foto local
  const imgSrc = hasGallery
    ? product.gallery[galIdx]
    : colorImgId != null
      ? `/api/images/product-images/${colorImgId}`
      : variantImg ?? product.image_url ?? (product.has_image ? `/api/images/products/${product.id}` : null)

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

  const handleColorChange = (color: string) => {
    setSelColor(color)
    setImgKey(k => k + 1)
    setGalIdx(0)
  }

  const buildWaMsg = (includeEnvio = false) => {
    let msg = t('greeting', { name: product.name })
    if (selColor && selColor.toLowerCase() !== 'varios')
      msg += `\n${t('colorLine', { color: selColor })}`
    if (selSize && selSize !== 'X')
      msg += `\n${t('sizeLine', { size: selSize })}`
    msg += `\n${t('priceLine', { price: fmt(product.price) })}`
    if (includeEnvio && localidad) {
      const city = cp ? `${localidad}, ${cp}` : localidad
      msg += `\n\n${t('shippingQuery', { city })}`
    }
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
      quantity:         1,
      freightOptions:   product.freight_options,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  // Texto de sugerencias según reason (usa t para i18n)
  const suggestionText: Record<SuggestionProduct['reason'], string> = {
    complementary: t('complementary'),
    trending:      t('trending'),
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-lg store-surface flex flex-col h-full overflow-hidden shadow-2xl">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b store-surface-blur backdrop-blur-sm shrink-0 z-10">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </button>
          {product.category && (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full store-badge-light">
              {product.category}
            </span>
          )}
        </div>

        {/* Scroll */}
        <div className="flex-1 overflow-y-auto pb-24">

          {/* Imagen principal + galería */}
          <div className="relative bg-gray-100">
            {/* Imagen principal */}
            <div className="aspect-[4/3]">
              {imgSrc ? (
                <img key={imgKey + '-' + galIdx} src={imgSrc} alt={product.name}
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center store-placeholder">
                  <span className="text-7xl font-bold store-placeholder-letter select-none">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Flechas de navegación (solo galería CJ con >1 imagen) */}
            {hasGallery && (
              <>
                <button
                  aria-label="Imagen anterior"
                  onClick={() => setGalIdx(i => (i - 1 + product.gallery.length) % product.gallery.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                >
                  ‹
                </button>
                <button
                  aria-label="Imagen siguiente"
                  onClick={() => setGalIdx(i => (i + 1) % product.gallery.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                >
                  ›
                </button>
                {/* Dots / contador */}
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {product.gallery.slice(0, 8).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setGalIdx(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === galIdx ? 'bg-white' : 'bg-white/40'
                      }`}
                    />
                  ))}
                  {product.gallery.length > 8 && (
                    <span className="text-white/60 text-[10px] ml-1">{galIdx + 1}/{product.gallery.length}</span>
                  )}
                </div>
              </>
            )}

            {/* Badge últimas unidades */}
            {isUltimas && (
              <div className="absolute top-3 left-3">
                <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white shadow animate-pulse">
                  <AlertTriangle className="h-3 w-3" /> {t('lastUnits')}
                </span>
              </div>
            )}
          </div>

          {/* Thumbnails de galería CJ (scroll horizontal) */}
          {hasGallery && (
            <div className="flex gap-2 px-3 py-2 overflow-x-auto bg-gray-50 border-b scrollbar-none">
              {product.gallery.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setGalIdx(i)}
                  className={`flex-none w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                    i === galIdx ? 'store-ring' : 'border-transparent'
                  }`}
                >
                  <img src={url} alt={`Vista ${i + 1}`}
                    className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div className="px-5 py-4 space-y-5">

            {/* Nombre + precio */}
            <div>
              <h1 className="text-xl font-bold leading-tight">{product.name}</h1>

              {product.today_promo && product.promo_price != null ? (
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-bold store-text-primary">{fmt(product.promo_price)}</span>
                    <span className="text-lg text-gray-400 line-through">{fmt(product.price)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl store-badge-gradient shadow-sm w-fit">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{t('todayOnly')}</span>
                    <span className="text-[11px] font-bold leading-tight">{product.today_promo}</span>
                  </div>
                  <p className="text-sm font-semibold store-text-primary">
                    {t('promoPrice', { price: fmt(product.promo_price) })}
                  </p>
                </div>
              ) : (
                <p className="text-3xl font-bold store-text-primary mt-1">{fmt(product.price)}</p>
              )}

              {store.cuotas > 0 && (
                <p className="text-sm text-gray-500 mt-1.5">
                  {t('installments', {
                    cuotas: store.cuotas,
                    price:  fmt(Math.round((product.promo_price ?? product.price) / store.cuotas)),
                  })}
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
                  {t('color')}
                  {selColor && selColor.toLowerCase() !== 'varios' && (
                    <span className="ml-2 font-medium store-text-primary normal-case">{selColor}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {colors.map(color => {
                    const css      = colorToCss(color)
                    const isVarios = color.toLowerCase() === 'varios'
                    const isSel    = selColor === color
                    const hasStock = product.variants.some(v => v.color === color && v.in_stock)
                    return (
                      <button key={color} title={color} onClick={() => handleColorChange(color)}
                        className={`relative w-9 h-9 rounded-full border-[3px] transition-all duration-150 focus:outline-none
                          ${isSel ? 'store-ring scale-110 shadow-lg' : 'border-gray-200 hover:border-gray-400'}
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
                  {t('sizeLabel')} {selSize && <span className="ml-2 font-medium store-text-primary normal-case">{selSize}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(size => {
                    const inStock = inStockSizes.has(size); const isSel = selSize === size
                    return (
                      <button key={size} onClick={() => inStock && setSelSize(isSel ? '' : size)} disabled={!inStock}
                        className={`min-w-[44px] px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-all
                          ${isSel ? 'store-active store-ring shadow'
                            : inStock ? 'border-gray-300 text-gray-700 hover:store-ring bg-white'
                            : 'border-gray-100 text-gray-300 bg-gray-50 line-through cursor-not-allowed'}`}
                      >{size}</button>
                    )
                  })}
                </div>
                {!selSize && <p className="text-xs text-amber-600">{t('selectSizeHint')}</p>}
              </div>
            )}

            <div className="border-t border-gray-100" />

            {/* Medios de pago */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t('paymentMethods')}</p>
              <div className="space-y-2">

                {store.payment_gateway === 'paypal' ? (
                  /* ── PayPal ── */
                  <>
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                      <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
                      <div>
                        {/* Logo PayPal con texto inline */}
                        <p className="text-sm font-medium text-gray-800">
                          <span className="font-black">
                            <span className="text-[#003087]">Pay</span>
                            <span className="text-[#009cde]">Pal</span>
                          </span>
                          {' '}— {t('creditDebitCard')}
                        </p>
                        <p className="text-xs text-gray-500">{t('secureCheckout')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3">
                      <Banknote className="h-5 w-5 text-yellow-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          <span className="font-black">
                            <span className="text-[#003087]">Pay</span>
                            <span className="text-[#009cde]">Pal</span>
                          </span>
                          {' '}Pay Later
                        </p>
                        <p className="text-xs text-gray-500">{t('buyNowPayLater')}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  /* ── Efectivo / Transferencia (manual o MercadoPago) ── */
                  <>
                    <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                      <Banknote className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t('cashTransfer')}</p>
                        <p className="text-xs text-gray-500">{t('listPrice')}</p>
                      </div>
                    </div>
                    {store.cuotas > 0 && (
                      <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                        <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{t('creditCards')}</p>
                          <p className="text-xs font-semibold text-blue-600">
                            {t('installmentsNoInterest', {
                              cuotas: store.cuotas,
                              price:  fmt(Math.round((product.promo_price ?? product.price) / store.cuotas)),
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Envíos */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t('shippingSection')}</p>

              {/* Opciones de envío CJ */}
              {product.freight_options.length > 0 ? (
                <div className="space-y-2">
                  {product.freight_options.map((opt, i) => {
                    const salePrice = product.promo_price ?? product.price
                    const bonified  = opt.freight < salePrice * 0.10
                    return (
                      <div key={i} className="flex items-start justify-between gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <Truck className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{opt.logisticName}</p>
                            {opt.logisticAging && (
                              <p className="text-xs text-gray-500">
                                Estimated delivery: {opt.logisticAging} business days
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {bonified ? (
                            <>
                              <p className="text-sm font-bold text-green-700">FREE</p>
                              {opt.freight > 0 && (
                                <p className="text-xs text-gray-400 line-through">{fmt(opt.freight)}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm font-bold store-text-primary">{fmt(opt.freight)}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : store.shipping_info ? (
                /* Envío configurado manualmente */
                <div className="space-y-1.5">
                  {store.shipping_info.split('\n').filter(l => l.trim()).map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <Truck className="h-4 w-4 store-text-primary shrink-0 mt-0.5" />
                      <span>{line.trim()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <StoreIcon className="h-4 w-4 shrink-0" />
                  <span>{t('shippingContact')}</span>
                </div>
              )}
              {/* Calculadora de envío — solo para productos locales (no CJ) */}
              {!product.cj_pid && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">{t('calculateShipping')}</p>
                  <div className="flex gap-2">
                    <input type="text" placeholder={t('cityPlaceholder')} value={localidad}
                      onChange={e => setLocalidad(e.target.value)}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 store-focus-ring bg-white" />
                    <input type="text" placeholder={t('zipPlaceholder')} value={cp}
                      onChange={e => setCp(e.target.value)}
                      className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 store-focus-ring bg-white" />
                  </div>
                  {waEnvio ? (
                    <a href={waEnvio} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors">
                      <MessageCircle className="h-4 w-4" /> {t('whatsappShippingBtn')}
                    </a>
                  ) : (
                    <p className="text-xs text-gray-400 text-center">{t('enterCity')}</p>
                  )}
                </div>
              )}
            </div>

            {/* Sugerencias */}
            {suggestions.length > 0 && (
              <>
                <div className="border-t border-gray-100" />
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                    {SUGGESTION_ICON[suggestions[0].reason]}
                    {suggestionText[suggestions[0].reason]}
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
                          className="flex-none w-32 rounded-xl overflow-hidden store-surface border border-gray-100 shadow-sm hover:shadow-md transition-shadow text-left"
                        >
                          <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
                            {sugImg
                              ? <img src={sugImg} alt={sug.name} className="w-full h-full object-cover" loading="lazy" />
                              : <div className="w-full h-full flex items-center justify-center store-placeholder">
                                  <span className="text-2xl font-bold store-placeholder-letter">{sug.name.charAt(0).toUpperCase()}</span>
                                </div>
                            }
                          </div>
                          <div className="p-2">
                            {sug.category && <p className="text-[9px] store-text-primary font-medium uppercase tracking-wide mb-0.5 truncate">{sug.category}</p>}
                            <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{sug.name}</p>
                            <p className="text-xs font-bold store-text-primary mt-1">{fmt(sug.price)}</p>
                            {sug.stock_total === 0 && <p className="text-[10px] text-gray-400">{t('outOfStock')}</p>}
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
        <div className="absolute bottom-0 left-0 right-0 p-4 store-surface-blur backdrop-blur-sm border-t space-y-2">

          {/* Botón primario: Agregar al carrito */}
          {product.variants.some(v => v.in_stock) ? (
            <button onClick={handleAddToCart}
              disabled={!canBuy && !alreadyInCart}
              className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-base font-bold transition-all
                ${alreadyInCart
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : canBuy
                    ? 'store-btn-primary shadow-lg'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {alreadyInCart
                ? <><Check className="h-5 w-5" /> {t('viewCart')}</>
                : canBuy
                  ? <><ShoppingCart className="h-5 w-5" />{added ? t('added') : t('addToCart')}</>
                  : <><ShoppingCart className="h-5 w-5" />{t('selectSize')}</>}
            </button>
          ) : (
            <div className="flex items-center justify-center w-full py-3.5 rounded-xl text-base font-bold bg-gray-100 text-gray-400">
              {t('outOfStock')}
            </div>
          )}

          {/* Botón secundario: WhatsApp */}
          {waBase && product.variants.some(v => v.in_stock) && (
            <a href={waBase} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold border border-green-200 text-green-600 hover:bg-green-50 transition-colors">
              <MessageCircle className="h-4 w-4" />
              {t('whatsapp')}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
