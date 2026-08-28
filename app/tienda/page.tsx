"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from 'next-intl'
import {
  ShoppingBag, MapPin, Phone, MessageCircle,
  Search, SlidersHorizontal, X, ShoppingCart,
} from "lucide-react"
import { toast } from "sonner"
import type { Product, StoreData, CatalogData } from './_types'
import { colorToCss, sortSizes, totalStock } from './_utils'
import { useCart }     from './_context/cart-context'
import { useCurrency } from './_context/currency-context'
import CartDrawer from './_components/cart-drawer'

// El modal se carga solo cuando el usuario abre un producto (chunk separado)
const ProductModal = dynamic(() => import('./_components/product-modal'), { ssr: false })

// ══════════════════════════════════════════════════════════════════════════════
// Badge de promo del día
// ══════════════════════════════════════════════════════════════════════════════
function TodayPromoBadge({ summary, label }: { summary: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-sm">
      <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</span>
      <span className="text-[11px] font-bold leading-tight">{summary}</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tarjeta de producto
// ══════════════════════════════════════════════════════════════════════════════
function ProductCard({ product, waNumber, onSelect }: {
  product:  Product
  waNumber: string | null
  onSelect: () => void
}) {
  const { fmt } = useCurrency()
  const t = useTranslations('ProductCard')

  // Solo colores con al menos un talle en stock
  const colors = [...new Set(product.variants.filter(v => v.in_stock).map(v => v.color))]
  const [selColor,      setSelColor     ] = useState<string>(colors[0] ?? '')
  const [imgKey,        setImgKey       ] = useState(0)
  const [descExpanded,  setDescExpanded ] = useState(false)

  const variantsForColor = product.variants.filter(v => v.color === selColor)
  const sizes        = sortSizes([...new Set(variantsForColor.map(v => v.size))])
  const inStockSizes = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))
  const anyInStock   = product.variants.some(v => v.in_stock)
  const isUltimas    = anyInStock && totalStock(product) <= 3

  const variantImg   = variantsForColor[0]?.specific_image_url
  const colorImgId   = product.images_by_color[selColor]
  // Prioridad: foto de color del catálogo → specific_image_url de variante → foto principal del producto
  const imgSrc = colorImgId != null
    ? `/api/images/product-images/${colorImgId}`
    : variantImg ?? (product.has_image ? `/api/images/products/${product.id}` : null)
  const longDesc = (product.description?.length ?? 0) > 80

  const colorPart = selColor && selColor !== 'Varios'
    ? t('whatsappColorPart', { color: selColor })
    : ''
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        t('whatsappMessage', { name: product.name, colorPart, price: fmt(product.price) })
      )}`
    : null

  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 flex flex-col">

      {/* Imagen */}
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden cursor-pointer" onClick={onSelect}>
        {imgSrc ? (
          <img key={imgKey} src={imgSrc} alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-pink-100">
            <span className="text-5xl font-bold text-violet-300 select-none">
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {anyInStock && isUltimas && (
          <span className="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white shadow-sm animate-pulse">
            {t('lastItems')}
          </span>
        )}
        {!anyInStock && (
          <span className="absolute top-2.5 left-2.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-400 text-white shadow-sm">
            {t('outOfStock')}
          </span>
        )}
        {product.category && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 shadow-sm">
            {product.category}
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-end justify-center pb-3">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold bg-black/60 px-3 py-1 rounded-full">
            {t('viewDetails')}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">
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
                <button className="text-[11px] text-violet-500 hover:text-violet-700 font-medium mt-0.5"
                  onClick={e => { e.stopPropagation(); setDescExpanded(v => !v) }}>
                  {descExpanded ? t('showLess') : t('showMore')}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {product.today_promo && product.promo_price != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-violet-700 tracking-tight">{fmt(product.promo_price)}</p>
                <p className="text-sm text-gray-400 line-through">{fmt(product.price)}</p>
              </div>
              <TodayPromoBadge summary={product.today_promo} label={t('todayOnly')} />
              <p className="text-xs text-violet-600 font-medium">
                {t('promoPrice', { price: fmt(product.promo_price) })}
              </p>
            </>
          ) : (
            <p className="text-xl font-bold text-gray-900 tracking-tight">{fmt(product.price)}</p>
          )}
          {product.cuotas > 0 && (
            <p className="text-xs text-gray-500">
              {t('installments', {
                cuotas: product.cuotas,
                price:  fmt(Math.round((product.promo_price ?? product.price) / product.cuotas)),
              })}
            </p>
          )}
        </div>

        {/* Colores */}
        {colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {colors.map(color => {
              const css      = colorToCss(color)
              const isVarios = color.toLowerCase() === 'varios'
              const isSel    = selColor === color
              const hasStock = product.variants.some(v => v.color === color && v.in_stock)
              return (
                <button key={color} title={color}
                  onClick={() => { setSelColor(color); setImgKey(k => k + 1) }}
                  className={`relative w-6 h-6 rounded-full border-2 transition-all duration-150 focus:outline-none
                    ${isSel ? 'border-violet-500 scale-110 shadow-md' : 'border-transparent hover:border-gray-300 hover:scale-105'}
                    ${!hasStock ? 'opacity-40' : ''}`}
                  style={isVarios
                    ? { background: 'linear-gradient(135deg,#f472b6,#818cf8,#34d399)' }
                    : { backgroundColor: css ?? '#e5e7eb' }}
                >
                  {!hasStock && <span className="absolute inset-0 flex items-center justify-center"><span className="block w-5 h-px bg-gray-400 rotate-45" /></span>}
                </button>
              )
            })}
          </div>
        )}
        {selColor && selColor.toLowerCase() !== 'varios' && (
          <p className="text-xs text-gray-500 -mt-0.5">{t('colorLabel', { color: selColor })}</p>
        )}

        {/* Talles */}
        {sizes.length > 0 && !(sizes.length === 1 && sizes[0] === 'X') && (
          <div className="flex flex-wrap gap-1">
            {sizes.map(size => {
              const inStock = inStockSizes.has(size)
              return (
                <span key={size}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border
                    ${inStock ? 'border-gray-300 text-gray-700 bg-white' : 'border-gray-200 text-gray-300 line-through bg-gray-50'}`}>
                  {t('sizeTag', { size })}
                </span>
              )
            })}
          </div>
        )}

        <div className="mt-auto pt-1 flex gap-2">
          <button onClick={onSelect}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors">
            {t('viewDetails')}
          </button>
          {waHref && anyInStock && (
            <a href={waHref} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors">
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
  const { itemCount, openCart } = useCart()
  const t = useTranslations('Store')

  const [data,            setData           ] = useState<CatalogData | null>(null)
  const [loading,         setLoading        ] = useState(true)
  const [selCategory,     setSelCategory    ] = useState('__all__')
  const [selAgeGroup,     setSelAgeGroup    ] = useState('__all__')
  const [inStockOnly,     setInStockOnly    ] = useState(false)
  const [search,          setSearch         ] = useState('')
  const [filtersOpen,     setFiltersOpen    ] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  useEffect(() => {
    fetch('/api/catalog').then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('msg') === 'no_account') {
      toast.info('Tu cuenta de Google no está registrada en el sistema', {
        description: (
          <span>Contactá a ROISOL:{' '}
            <a href="https://wa.me/541131005865" target="_blank" rel="noopener noreferrer" className="underline font-medium">WhatsApp →</a>
          </span>
        ),
        duration: 10000,
      })
    }
  }, [])

  useEffect(() => {
    const handler = (e: CustomEvent<Product>) => setSelectedProduct(e.detail)
    document.addEventListener('open-product', handler as EventListener)
    return () => document.removeEventListener('open-product', handler as EventListener)
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.products.filter(p => {
      if (selCategory !== '__all__' && p.category  !== selCategory)  return false
      if (selAgeGroup !== '__all__' && p.age_group !== selAgeGroup)  return false
      if (inStockOnly && !p.variants.some(v => v.in_stock))         return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q)
          || (p.description?.toLowerCase().includes(q) ?? false)
          || (p.category?.toLowerCase().includes(q) ?? false)
      }
      return true
    })
  }, [data, selCategory, selAgeGroup, inStockOnly, search])

  const store = data?.store

  return (
    <div className="min-h-screen bg-gray-50">

      <CartDrawer />

      {selectedProduct && data && (
        <ProductModal
          product={selectedProduct}
          store={data.store}
          allProducts={data.products}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b relative">
        {/* Botón carrito */}
        <button onClick={openCart}
          className="absolute top-3 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors shadow-sm">
          <ShoppingCart className="h-3.5 w-3.5" />
          {itemCount > 0 && (
            <span className="bg-white text-violet-700 rounded-full px-1.5 py-px text-[10px] font-black leading-none">
              {itemCount}
            </span>
          )}
          {t('cartButton')}
        </button>

        <a href="/login"
          className="absolute top-3 right-4 text-xs text-gray-400 hover:text-violet-600 transition-colors flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Acceder al sistema
        </a>
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col items-center gap-3">
          {store?.logo
            ? <img src={store.logo} alt={store.name ?? 'Logo'} className="h-16 object-contain" />
            : <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                <ShoppingBag className="h-8 w-8 text-white" />
              </div>
          }
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
              {store?.phone && (
                <a href={`tel:${store.phone}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
                  <Phone className="h-3.5 w-3.5" />{store.phone}
                </a>
              )}
              {store?.whatsapp && (
                <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-green-600 hover:text-green-700 font-medium">
                  <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      {store?.has_banner && (
        <div className="w-full overflow-hidden" style={{ aspectRatio: '3/1', maxHeight: '400px' }}>
          <img src="/api/images/banner" alt="Banner" className="w-full h-full object-cover" />
        </div>
      )}
      {store?.banner_text && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap justify-center gap-x-6 gap-y-1.5">
            {store.banner_text.split('\n').filter(l => l.trim()).map((line, i) => (
              <span key={i} className="text-sm text-gray-700 whitespace-pre">{line.trim()}</span>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input type="search" placeholder={t('searchPlaceholderEllipsis')} value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300" />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1">
            {[{ label: t('allCategoriesFilter'), val: '__all__' }, ...(data?.categories ?? []).map(c => ({ label: c, val: c }))].map(({ label, val }) => (
              <button key={val} onClick={() => setSelCategory(val)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0
                  ${selCategory === val ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setInStockOnly(v => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${inStockOnly ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t('inStockOnly')}
            </button>
            <button className="sm:hidden flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
              onClick={() => setFiltersOpen(v => !v)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {(data?.age_groups ?? []).length > 0 && (
          <div className="max-w-7xl mx-auto px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0 mr-1">{t('ageLabel')}</span>
            {[{ label: t('allAgeGroupsFilter'), val: '__all__' }, ...(data?.age_groups ?? []).map(ag => ({ label: ag, val: ag }))].map(({ label, val }) => (
              <button key={val} onClick={() => setSelAgeGroup(val)}
                className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0
                  ${selAgeGroup === val ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {filtersOpen && (
          <div className="sm:hidden px-4 pb-3 flex flex-wrap gap-1.5">
            {[{ label: t('allCategoriesFilter'), val: '__all__' }, ...(data?.categories ?? []).map(c => ({ label: c, val: c }))].map(({ label, val }) => (
              <button key={val} onClick={() => { setSelCategory(val); setFiltersOpen(false) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${selCategory === val ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {!loading && filtered.length > 0 && (
          <p className="text-sm text-gray-400 mb-5">
            {t('productCount', { count: filtered.length })}
            {selCategory !== '__all__' && ` ${t('inCategory', { category: selCategory })}`}
            {selAgeGroup !== '__all__' && ` · ${selAgeGroup}`}
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
              <ProductCard key={product.id} product={product}
                waNumber={store?.whatsapp ?? null}
                onSelect={() => setSelectedProduct(product)} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300 gap-3">
            <ShoppingBag className="h-14 w-14" />
            <p className="text-base text-gray-400">
              {(selCategory !== '__all__' || selAgeGroup !== '__all__' || inStockOnly || search)
                ? t('noProducts')
                : t('noProductsAvailable')}
            </p>
            {(selCategory !== '__all__' || selAgeGroup !== '__all__' || inStockOnly || search) && (
              <button className="text-sm text-violet-500 hover:text-violet-700"
                onClick={() => { setSelCategory('__all__'); setSelAgeGroup('__all__'); setInStockOnly(false); setSearch('') }}>
                {t('clearFilters')}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
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
              <a href="https://instagram.com/malema.ba" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 transition-colors" title="Instagram @malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://facebook.com/malema.ba" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 transition-colors" title="Facebook malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="https://tiktok.com/@malema.ba" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 transition-colors" title="TikTok @malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg>
              </a>
              <a href="https://youtube.com/@MALEMA.STOREBA" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 transition-colors" title="YouTube @MALEMA.STOREBA">
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
