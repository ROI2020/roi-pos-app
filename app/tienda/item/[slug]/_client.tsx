"use client"

/**
 * ItemClient — Componente interactivo de la página de producto individual.
 *
 * Maneja: galería de imágenes, selector de color/talle, add-to-cart, WhatsApp.
 * Los datos del producto vienen del Server Component (page.tsx) como props.
 */

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ShoppingCart, MessageCircle, ChevronLeft, ZoomIn } from "lucide-react"
import { toast } from "sonner"
import { useCart }     from "../../_context/cart-context"
import { useCurrency } from "../../_context/currency-context"
import { colorToCss, sortSizes } from "../../_utils"
import type { CJFreightOption } from "../../_types"

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
  id:              number
  name:            string
  long_name:       string | null
  slug:            string
  description:     string | null
  price:           number
  promo_price:     number | null
  today_promo:     string | null
  cuotas:          number
  category:        string | null
  has_image:       boolean
  general_image_url: string | null
  cj_pid:          string | null
  freight_options: CJFreightOption[]
  gallery:         string[]       // URLs de imágenes CJ (general + productImages)
  variants:        ItemVariant[]
  images_by_color: Record<string, string> // color → URL imagen local
}

interface Props {
  product:    ItemProduct
  waNumber:   string | null
  storePath:  string
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function ItemClient({ product, waNumber, storePath }: Props) {
  const router  = useRouter()
  const { fmt } = useCurrency()
  const { addItem, openCart } = useCart()

  const colors = useMemo(
    () => [...new Set(product.variants.filter(v => v.in_stock).map(v => v.color).filter(c => c))],
    [product.variants]
  )

  const [selColor, setSelColor] = useState<string>(colors[0] ?? '')
  const [selSize,  setSelSize ] = useState<string>('')
  const [mainImg,  setMainImg ] = useState<number>(0)

  // Variantes del color seleccionado
  const variantsForColor = selColor
    ? product.variants.filter(v => v.color === selColor)
    : product.variants
  const sizes        = sortSizes([...new Set(variantsForColor.map(v => v.size).filter(Boolean))])
  const inStockSizes = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))
  const anyInStock   = product.variants.some(v => v.in_stock)
  const stockTotal   = product.variants.reduce((s, v) => s + v.stock_count, 0)
  const isUltimas    = anyInStock && stockTotal <= 3

  // Imágenes: galería CJ + imagen color local
  const colorImgUrl  = selColor ? product.images_by_color[selColor] : undefined
  const thumbs: string[] = useMemo(() => {
    const base = product.gallery.length > 0
      ? product.gallery
      : product.general_image_url
        ? [product.general_image_url]
        : product.has_image
          ? [`/api/images/products/${product.id}`]
          : []
    // Si hay foto de color local, inyectar al frente
    if (colorImgUrl) return [colorImgUrl, ...base]
    return base
  }, [product.gallery, product.general_image_url, product.has_image, product.id, colorImgUrl])

  // Resetear selección de imagen cuando cambia color
  const handleColorChange = (c: string) => {
    setSelColor(c)
    setSelSize('')
    setMainImg(0)
  }

  // Variante seleccionada
  const selectedVariant = useMemo(() => {
    if (!selSize) return null
    return product.variants.find(
      v => v.color === selColor && v.size === selSize && v.in_stock
    ) ?? null
  }, [product.variants, selColor, selSize])

  // Precio activo
  const displayPrice = product.promo_price ?? product.price

  // Add to cart
  const handleAddToCart = () => {
    if (!selectedVariant) {
      toast.error(sizes.length > 0 ? 'Elegí un talle' : 'Seleccioná una opción')
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
    toast.success(`${product.name} agregado al carrito`)
    openCart()
  }

  // WhatsApp
  const colorPart = selColor && selColor !== 'Varios' ? ` - ${selColor}` : ''
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hola, me interesa: ${product.name}${colorPart} — $${displayPrice}`
      )}`
    : null

  const imgSrc = thumbs[mainImg] ?? null

  return (
    <div className="min-h-screen store-bg">
      {/* Nav breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <button
          onClick={() => router.push(storePath)}
          className="flex items-center gap-1.5 text-sm store-text-muted hover:store-text-primary transition-colors"
        >
          <ChevronLeft size={16} />
          Volver a la tienda
        </button>
      </div>

      <main className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">

          {/* ── Galería ─────────────────────────────────────────── */}
          <div className="space-y-3">
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
                  ¡Últimas unidades!
                </span>
              )}
              {!anyInStock && (
                <span className="absolute top-3 left-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-400 text-white">
                  Sin stock
                </span>
              )}
              {product.category && (
                <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 shadow">
                  {product.category}
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
          </div>

          {/* ── Info y acciones ─────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            {/* Nombre */}
            <div>
              <h1 className="text-2xl font-bold leading-tight store-text">
                {product.name}
              </h1>
              {product.long_name && product.long_name !== product.name && (
                <p className="text-sm store-text-muted mt-1 leading-snug">
                  {product.long_name}
                </p>
              )}
            </div>

            {/* Precio */}
            <div className="space-y-1">
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
                  {product.cuotas}x {fmt(Math.round(displayPrice / product.cuotas))} sin interés
                </p>
              )}
            </div>

            {/* Colores */}
            {colors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide store-text-muted">
                  Color{selColor ? `: ${selColor}` : ''}
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
                        className={`relative w-8 h-8 rounded-full border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--store-primary,#4f46e5)] ${
                          isSel
                            ? 'border-[var(--store-primary,#4f46e5)] scale-110 shadow-md'
                            : 'border-gray-300 hover:scale-105'
                        }`}
                        style={{ background: isVarios ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : (css ?? undefined) }}
                      >
                        {isVarios && !css && (
                          <span className="text-[8px] font-bold text-white mix-blend-difference">✦</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Talles */}
            {sizes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide store-text-muted">
                  Talle{selSize ? `: ${selSize}` : ''}
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

            {/* Descripción */}
            {product.description && (
              <div className="prose prose-sm max-w-none store-text-muted border-t border-[var(--store-border,#e5e7eb)] pt-4">
                <p className="text-sm leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Acciones */}
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={handleAddToCart}
                disabled={!anyInStock}
                className="flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all
                  bg-[var(--store-primary,#4f46e5)] text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <ShoppingCart size={18} />
                {anyInStock
                  ? sizes.length > 0 && !selSize
                    ? 'Elegí un talle para agregar'
                    : 'Agregar al carrito'
                  : 'Sin stock'}
              </button>

              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl font-semibold text-sm border border-green-500 text-green-600 hover:bg-green-50 transition-colors"
                >
                  <MessageCircle size={18} />
                  Consultar por WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
