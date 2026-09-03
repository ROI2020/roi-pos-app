"use client"

/**
 * ItemClient — Página individual de producto (Client Component).
 *
 * Layout desktop: 2 columnas
 *   Izquierda: nombre · long_name · descripción (texto largo)
 *   Derecha:   galería · precio · colores · talles · pago · envíos · CTA
 *
 * Mobile: columna única, galería primero.
 */

import { useState, useMemo, useEffect } from "react"
import { useRouter }         from "next/navigation"
import {
  ShoppingCart, MessageCircle, ChevronLeft, ZoomIn,
  CreditCard, Banknote, Truck, Store as StoreIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast }           from "sonner"
import { useCart }         from "../../_context/cart-context"
import { useCurrency }     from "../../_context/currency-context"
import { colorToCss, sortSizes } from "../../_utils"
import type { CJFreightOption }  from "../../_types"

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ItemVariant {
  id:                 number
  sku:                string
  color:              string
  size:               string
  specific_image_url: string | null
  in_stock:           boolean
  stock_count:        number
}

export interface ItemProduct {
  id:               number
  name:             string
  long_name:        string | null
  slug:             string
  description:      string | null
  price:            number
  promo_price:      number | null
  today_promo:      string | null
  cuotas:           number
  category:         string | null
  has_image:        boolean
  general_image_url: string | null
  cj_pid:           string | null
  freight_options:  CJFreightOption[]
  gallery:          string[]
  variants:         ItemVariant[]
  images_by_color:  Record<string, string>
}

interface Props {
  product:        ItemProduct
  waNumber:       string | null
  storePath:      string
  paymentGateway: 'paypal' | 'mercadopago' | 'manual'
  shippingInfo:   string | null
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function ItemClient({ product, waNumber, storePath, paymentGateway, shippingInfo }: Props) {
  const router  = useRouter()
  const { fmt } = useCurrency()
  const { addItem, items: cartItems, openCart } = useCart()
  const t = useTranslations('ProductModal')

  // ── DS / CJ detection ───────────────────────────────────────────────────────
  // Si el producto tiene cj_pid o general_image_url es DS: el stock lo gestiona
  // el proveedor, no branch_inventory. Todos los colores/talles están disponibles.
  const isDS = !!product.cj_pid || !!product.general_image_url

  // ── Colores ─────────────────────────────────────────────────────────────────
  // DS: todos los colores · Físicos: solo los que tienen stock
  const colors = useMemo(
    () => [...new Set(
      product.variants
        .filter(v => isDS || v.in_stock)
        .map(v => v.color)
        .filter(c => c),
    )],
    [product.variants, isDS],
  )

  const [selColor, setSelColor] = useState<string>(colors[0] ?? '')
  const [selSize,  setSelSize ] = useState<string>('')
  const [mainImg,  setMainImg ] = useState<number>(0)

  // ── Variantes del color seleccionado ────────────────────────────────────────
  const variantsForColor = selColor
    ? product.variants.filter(v => v.color === selColor)
    : product.variants

  const sizes = sortSizes([...new Set(variantsForColor.map(v => v.size).filter(Boolean))])

  // DS: todos los talles disponibles · Físicos: solo los con stock
  const inStockSizes = new Set(
    variantsForColor.filter(v => isDS || v.in_stock).map(v => v.size),
  )

  // Sin talle diferenciado (o solo 'X'): no pedir selección de talle al usuario
  const singleSize = sizes.length === 0 || (sizes.length === 1 && sizes[0] === 'X')

  // Auto-seleccionar talle cuando no hay opciones reales
  useEffect(() => {
    if (singleSize) setSelSize(sizes[0] ?? 'X')
    else            setSelSize('')
  }, [selColor]) // eslint-disable-line react-hooks/exhaustive-deps

  const anyInStock   = isDS ? true : product.variants.some(v => v.in_stock)
  const stockTotal   = product.variants.reduce((s, v) => s + v.stock_count, 0)
  const isUltimas    = !isDS && anyInStock && stockTotal <= 3

  // Sin variantes DS: redirige a WhatsApp en vez de mostrar error
  const noVariantsDS = isDS && product.variants.length === 0

  // ── Variante seleccionada ────────────────────────────────────────────────────
  // singleSize: cualquier variante del color seleccionado (sin importar talle)
  const selectedVariant = useMemo(() => {
    if (!singleSize && !selSize) return null
    return product.variants.find(
      v => v.color === selColor && (isDS || v.in_stock) && (singleSize || v.size === selSize),
    ) ?? null
  }, [product.variants, selColor, selSize, isDS, singleSize])

  // ── Precio ──────────────────────────────────────────────────────────────────
  const displayPrice = product.promo_price ?? product.price

  // ── Estado carrito ───────────────────────────────────────────────────────────
  const isInCart = cartItems.some(i => i.productId === product.id)

  // ── Galería ──────────────────────────────────────────────────────────────────
  const colorImgUrl = selColor ? product.images_by_color[selColor] : undefined
  const thumbs: string[] = useMemo(() => {
    const base = product.gallery.length > 0
      ? product.gallery
      : product.general_image_url
        ? [product.general_image_url]
        : product.has_image
          ? [`/api/images/products/${product.id}`]
          : []
    return colorImgUrl ? [colorImgUrl, ...base] : base
  }, [product.gallery, product.general_image_url, product.has_image, product.id, colorImgUrl])

  const imgSrc = thumbs[mainImg] ?? null

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleColorChange = (c: string) => {
    setSelColor(c)
    setSelSize('')
    setMainImg(0)
  }

  const handleAddToCart = () => {
    if (isInCart)    { openCart(); return }
    if (noVariantsDS){ toast.info(t('whatsapp')); return }
    if (!selectedVariant) {
      toast.error(t('selectSizeHint'))
      return
    }
    addItem({
      variantId:        selectedVariant.id,
      productId:        product.id,
      productName:      product.name,
      variantSku:       selectedVariant.sku,
      color:            selectedVariant.color,
      size:             selectedVariant.size,
      specificImageUrl: selectedVariant.specific_image_url ?? thumbs[0] ?? null,
      hasImage:         product.has_image || !!product.general_image_url,
      price:            displayPrice,
      cuotas:           product.cuotas,
      quantity:         1,
      freightOptions:   product.freight_options,
    })
    toast.success(t('added'))
    openCart()
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────────
  const buildWaMsg = () => {
    let msg = t('greeting', { name: product.name })
    if (selColor && selColor !== 'Varios')
      msg += `\n${t('colorLine', { color: selColor })}`
    if (selSize && selSize !== 'X')
      msg += `\n${t('sizeLine',  { size:  selSize  })}`
    msg += `\n${t('priceLine', { price: fmt(displayPrice) })}`
    return msg
  }
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(buildWaMsg())}`
    : null

  // ── Texto del botón principal ─────────────────────────────────────────────
  const ctaLabel = isInCart
    ? t('viewCart')
    : !anyInStock
      ? t('outOfStock')
      : noVariantsDS
        ? t('whatsapp')
        : !singleSize && !selSize
          ? t('selectSize')
          : t('addToCart')

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen store-bg">

      {/* Breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
        <button
          onClick={() => router.push(storePath)}
          className="flex items-center gap-1.5 text-sm store-text-muted hover:store-text-primary transition-colors"
        >
          <ChevronLeft size={16} />
          {t('back')}
        </button>
      </div>

      <main className="max-w-6xl mx-auto px-4 pb-20">
        {/*
          Desktop: 2 columnas  |  Mobile: 1 columna con galería primero
          En mobile la columna derecha (galería+acciones) se mueve arriba con order-first
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 items-start">

          {/* ── COLUMNA IZQUIERDA: texto del producto ── */}
          <div className="space-y-5 order-2 md:order-1">

            {/* Nombre */}
            <div className="space-y-1.5">
              <h1 className="text-3xl lg:text-4xl font-bold leading-tight store-text">
                {product.name}
              </h1>
              
              {product.long_name && product.long_name !== product.name && (
                <p className="text-base store-text-muted leading-snug font-medium">
                  {product.long_name}
                </p>
              )}
              <hr className="border-[var(--store-border,#e5e7eb)]" />
            </div>

            {/* Descripción */}
            {product.description && (
              <div className="prose prose-sm max-w-none store-text-muted">
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}

            {/* Categoría */}
            {product.category && (
              <span className="inline-block text-[10px] font-medium px-2.5 py-1 rounded-full bg-white/80 border border-[var(--store-border,#e5e7eb)] store-text-muted">
                {product.category}
              </span>
            )}
          </div>

          {/* ── COLUMNA DERECHA: galería + acciones ── */}
          <div className="space-y-5 order-1 md:order-2">

            {/* Imagen principal */}
            <div className="relative aspect-square store-surface rounded-2xl overflow-hidden group shadow-sm">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center store-placeholder">
                  <span className="text-8xl font-bold store-placeholder-letter select-none">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {thumbs.length > 1 && (
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={18} className="text-white drop-shadow" />
                </div>
              )}
              {/* Badges */}
              {isUltimas && (
                <span className="absolute top-3 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white shadow animate-pulse">
                  {t('lastUnits')}
                </span>
              )}
              {!isDS && !anyInStock && (
                <span className="absolute top-3 left-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-400 text-white">
                  {t('outOfStock')}
                </span>
              )}
            </div>

            {/* Miniaturas */}
            {thumbs.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {thumbs.slice(0, 8).map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setMainImg(i)}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      mainImg === i
                        ? 'border-[var(--store-primary,#4f46e5)] ring-1 ring-[var(--store-primary,#4f46e5)]'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt={`Vista ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Precio 
            <div className="space-y-1">*/}
            <div className="border-t border-[var(--store-border,#e5e7eb)] pt-4 space-y-2">
              {product.today_promo && product.promo_price != null ? (
                <>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold store-text-primary tracking-tight">
                      {fmt(product.promo_price)}
                    </span>
                    <span className="text-base store-text-muted line-through">
                      {fmt(product.price)}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl store-badge-gradient text-xs font-bold shadow-sm">
                    {product.today_promo}
                  </div>
                </>
              ) : (
                <span className="text-3xl font-extrabold store-text-primary tracking-tight">
                  {fmt(product.price)}
                </span>
              )}
              {product.cuotas > 0 && (
                <p className="text-xs store-text-muted">
                  {t('installmentsNoInterest', {
                    cuotas: product.cuotas,
                    price:  fmt(Math.round(displayPrice / product.cuotas)),
                  })}
                </p>
              )}
            </div>

            {/* Colores */}
            {colors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide store-text-muted">
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
                    return (
                      <button
                        key={color}
                        title={color}
                        onClick={() => handleColorChange(color)}
                        className={`relative w-9 h-9 rounded-full border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--store-primary,#4f46e5)] ${
                          isSel
                            ? 'border-[var(--store-primary,#4f46e5)] scale-110 shadow-md'
                            : 'border-gray-300 hover:scale-105'
                        }`}
                        style={{
                          background: isVarios
                            ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)'
                            : (css ?? undefined),
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Talles */}
            {sizes.length > 0 && (
              /* <div className="space-y-2"> */
              <div className="border-t border-[var(--store-border,#e5e7eb)] pt-4 space-y-2">  
                <p className="text-xs font-semibold uppercase tracking-wide store-text-muted">
                  {t('sizeLabel')}
                  {selSize && (
                    <span className="ml-2 font-medium store-text-primary normal-case">{selSize}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(size => {
                    const inStock = inStockSizes.has(size)
                    const isSel   = selSize === size
                    return (
                      <button
                        key={size}
                        disabled={!inStock}
                        onClick={() => setSelSize(size)}
                        className={`min-w-[2.5rem] px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                          isSel
                            ? 'border-[var(--store-primary,#4f46e5)] bg-[var(--store-primary,#4f46e5)] text-white shadow-sm'
                            : inStock
                              ? 'border-gray-300 store-surface store-text hover:border-[var(--store-primary,#4f46e5)]'
                              : 'border-gray-200 text-gray-300 cursor-not-allowed line-through'
                        }`}
                      >
                        {size || '—'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Medios de pago */}
            <div className="border-t border-[var(--store-border,#e5e7eb)] pt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide store-text-muted">
                {t('paymentMethods')}
              </p>
              <div className="space-y-2">
                {paymentGateway === 'paypal' ? (
                  <>
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                      <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
                      <div>
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
                  <>
                    <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                      <Banknote className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t('cashTransfer')}</p>
                        <p className="text-xs text-gray-500">{t('listPrice')}</p>
                      </div>
                    </div>
                    {product.cuotas > 0 && (
                      <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                        <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{t('creditCards')}</p>
                          <p className="text-xs font-semibold text-blue-600">
                            {t('installmentsNoInterest', {
                              cuotas: product.cuotas,
                              price:  fmt(Math.round(displayPrice / product.cuotas)),
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Envíos */}
            <div className="border-t border-[var(--store-border,#e5e7eb)] pt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide store-text-muted">
                {t('shippingSection')}
              </p>
              {product.freight_options.length > 0 ? (
                <div className="space-y-2">
                  {product.freight_options.map((opt, i) => {
                    const bonified = opt.freight < displayPrice * 0.10
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
              ) : shippingInfo ? (
                <div className="space-y-1.5">
                  {shippingInfo.split('\n').filter(l => l.trim()).map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm store-text">
                      <Truck className="h-4 w-4 store-text-primary shrink-0 mt-0.5" />
                      <span>{line.trim()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm store-text-muted">
                  <StoreIcon className="h-4 w-4 shrink-0" />
                  <span>{t('shippingContact')}</span>
                </div>
              )}
            </div>

            {/* CTA principal */}
            <div className="flex flex-col gap-3 pt-1">
              <button
                onClick={handleAddToCart}
                disabled={!anyInStock && !isInCart}
                className={`flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all shadow-sm
                  ${isInCart
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-[var(--store-primary,#4f46e5)] text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
              >
                <ShoppingCart size={18} />
                {ctaLabel}
              </button>

              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl font-semibold text-sm border border-green-500 text-green-600 hover:bg-green-50 transition-colors"
                >
                  <MessageCircle size={18} />
                  {t('whatsapp')}
                </a>
              )}
            </div>

          </div>{/* fin columna derecha */}
        </div>
      </main>
    </div>
  )
}
