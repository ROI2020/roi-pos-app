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
import InfoBar, { parseInfoItems } from './_components/info-bar'

// El modal se carga solo cuando el usuario abre un producto (chunk separado)
const ProductModal = dynamic(() => import('./_components/product-modal'), { ssr: false })

// ══════════════════════════════════════════════════════════════════════════════
// Badge de promo del día
// ══════════════════════════════════════════════════════════════════════════════
function TodayPromoBadge({ summary, label }: { summary: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl store-badge-gradient shadow-sm">
      <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</span>
      <span className="text-[11px] font-bold leading-tight">{summary}</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tarjeta de producto
// ══════════════════════════════════════════════════════════════════════════════
function ProductCard({ product, waNumber, storeCuotas, onSelect }: {
  product:     Product
  waNumber:    string | null
  storeCuotas: number
  onSelect:    () => void
}) {
  const { fmt } = useCurrency()
  const t = useTranslations('ProductCard')

  // Solo colores con al menos un talle en stock; filtramos string vacío (sin color diferenciado)
  const colors = [...new Set(product.variants.filter(v => v.in_stock).map(v => v.color).filter(c => c))]
  const [selColor,      setSelColor     ] = useState<string>(colors[0] ?? '')
  const [imgKey,        setImgKey       ] = useState(0)
  const [descExpanded,  setDescExpanded ] = useState(false)

  const variantsForColor = selColor
    ? product.variants.filter(v => v.color === selColor)
    : product.variants
  const sizes        = sortSizes([...new Set(variantsForColor.map(v => v.size).filter(s => s))])
  const inStockSizes = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))
  const anyInStock   = product.variants.some(v => v.in_stock)
  const isUltimas    = anyInStock && totalStock(product) <= 3

  const variantImg   = variantsForColor[0]?.specific_image_url
  const colorImgId   = product.images_by_color[selColor]
  // Prioridad: foto de color (local) → specific_image_url de variante (proxied) →
  //            image_url del producto (proxied CDN CJ) → foto principal local
  const imgSrc = colorImgId != null
    ? `/api/images/product-images/${colorImgId}`
    : variantImg ?? product.image_url ?? (product.has_image ? `/api/images/products/${product.id}` : null)
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
    <div className="group store-surface rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 flex flex-col">

      {/* Imagen */}
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden cursor-pointer" onClick={onSelect}>
        {imgSrc ? (
          <img key={imgKey} src={imgSrc} alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center store-placeholder">
            <span className="text-5xl font-bold store-placeholder-letter select-none">
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
          <h3 className="text-sm font-semibold leading-tight line-clamp-2 store-hover-primary transition-colors">
            {product.name}
          </h3>
          {product.description && (
            <div>
              <p className={`text-xs text-gray-400 mt-0.5 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
                {product.description}
              </p>
              {longDesc && (
                <button className="text-[11px] store-text-primary hover:opacity-80 font-medium mt-0.5"
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
                <p className="text-xl font-bold store-text-primary tracking-tight">{fmt(product.promo_price)}</p>
                <p className="text-sm text-gray-400 line-through">{fmt(product.price)}</p>
              </div>
              <TodayPromoBadge summary={product.today_promo} label={t('todayOnly')} />
              <p className="text-xs store-text-primary font-medium">
                {t('promoPrice', { price: fmt(product.promo_price) })}
              </p>
            </>
          ) : (
            <p className="text-xl font-bold store-text-primary tracking-tight">{fmt(product.price)}</p>
          )}
          {storeCuotas > 0 && (
            <p className="text-xs text-gray-500">
              {t('installments', {
                cuotas: storeCuotas,
                price:  fmt(Math.round((product.promo_price ?? product.price) / storeCuotas)),
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
                    ${isSel ? 'store-ring scale-110 shadow-md' : 'border-transparent hover:border-gray-300 hover:scale-105'}
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
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border store-btn-outline transition-colors">
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
    <div className="min-h-screen store-page">

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
      <header className="store-surface border-b relative">
        {/* Botón carrito */}
        <button onClick={openCart}
          className="absolute top-3 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full store-btn-primary text-xs font-semibold shadow-sm">
          <ShoppingCart className="h-3.5 w-3.5" />
          {itemCount > 0 && (
            <span className="bg-white store-text-primary rounded-full px-1.5 py-px text-[10px] font-black leading-none">
              {itemCount}
            </span>
          )}
          {t('cartButton')}
        </button>

        <a href="/login"
          className="absolute top-3 right-4 text-xs text-gray-400 store-hover-primary transition-colors flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          login
        </a>
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col items-center gap-3">
          {store?.logo
            ? <img src={store.logo} alt={store.name ?? 'Logo'} className="h-16 object-contain" />
            : <div className="w-16 h-16 rounded-full store-badge-gradient flex items-center justify-center">
                <ShoppingBag className="h-8 w-8 text-white" />
              </div>
          }
          <div className="text-center">
            <h1 className="text-2xl font-bold">{store?.name ?? 'Store'}</h1>
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

      {store?.html_banner ? (
        /* Banner HTML animado — renderizado en iframe aislado para preservar estilos y animaciones */
        <div className="w-full overflow-hidden" style={{ height: '420px' }}>
          <iframe
            srcDoc={store.html_banner}
            className="w-full h-full border-0"
            title="Banner"
            scrolling="no"
          />
        </div>
      ) : store?.has_banner ? (
        <div className="w-full overflow-hidden" style={{ aspectRatio: '3/1', maxHeight: '400px' }}>
          <img src="/api/images/banner" alt="Banner" className="w-full h-full object-cover" />
        </div>
      ) : null}
      {/* Barra informativa con íconos (catalog_info_items) — reemplaza banner_text */}
      {store?.info_items
        ? <InfoBar items={parseInfoItems(store.info_items)} />
        : store?.banner_text && (
        <div className="store-surface border-b">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap justify-center gap-x-6 gap-y-1.5">
            {store.banner_text.split('\n').filter(l => l.trim()).map((line, i) => (
              <span key={i} className="text-sm text-gray-700 whitespace-pre">{line.trim()}</span>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="sticky top-0 z-30 store-surface-blur backdrop-blur-md border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input type="search" placeholder={t('searchPlaceholderEllipsis')} value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 store-focus-ring" />
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
                  ${selCategory === val ? 'store-active' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
                  ${selAgeGroup === val ? 'store-active-secondary' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'}`}>
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
                  ${selCategory === val ? 'store-active' : 'bg-gray-100 text-gray-600'}`}>
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
              <div key={i} className="rounded-2xl overflow-hidden store-surface shadow-sm animate-pulse">
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
                storeCuotas={store?.cuotas ?? 0}
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
              <button className="text-sm store-text-primary hover:opacity-80"
                onClick={() => { setSelCategory('__all__'); setSelAgeGroup('__all__'); setInStockOnly(false); setSearch('') }}>
                {t('clearFilters')}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t store-surface mt-12 py-10">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-4">
          <div className="space-y-1">
            <p className="font-semibold text-gray-700">{store?.name}</p>
            {store?.address && <p className="text-sm text-gray-400">{store.address}</p>}
            {store?.phone   && <p className="text-sm text-gray-400">{store.phone}</p>}
          </div>
          {store?.footer_text && (
            // footer_text puede contener HTML configurado por el admin (links, iconos SVG, etc.)
            // eslint-disable-next-line react/no-danger
            <div dangerouslySetInnerHTML={{ __html: store.footer_text }} />
          )}
          <p className="text-xs text-gray-300">
            {t('footerDisclaimer')}
          </p>
        </div>
      </footer>
    </div>
  )
}
