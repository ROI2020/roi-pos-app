"use client"

import { useState, useEffect, useMemo } from "react"
import { ShoppingBag, MapPin, Phone, MessageCircle, Search, SlidersHorizontal, X } from "lucide-react"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Variant {
  id: number; sku: string; color: string; size: string
  specific_image_url: string | null; in_stock: boolean
}
interface Product {
  id: number; name: string; description: string | null
  price: number; category: string | null; has_image: boolean
  variants: Variant[]
}
interface Store {
  name: string | null; logo: string | null
  address: string | null; phone: string | null; whatsapp: string | null
  has_banner: boolean; banner_text: string | null
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
  if (k === 'varios') return null  // gradient especial
  return COLOR_CSS[k] ?? null
}

// ── Formateo ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

// ── Ordenamiento de talles ─────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// Tarjeta de producto
// ══════════════════════════════════════════════════════════════════════════════
function ProductCard({ product, waNumber }: { product: Product; waNumber: string | null }) {
  const colors     = [...new Set(product.variants.map(v => v.color))]
  const [selColor, setSelColor] = useState<string>(colors[0] ?? '')
  const [imgKey,   setImgKey  ] = useState(0)

  // Variantes del color seleccionado
  const variantsForColor = product.variants.filter(v => v.color === selColor)
  const sizes            = sortSizes([...new Set(variantsForColor.map(v => v.size))])
  const inStockSizes     = new Set(variantsForColor.filter(v => v.in_stock).map(v => v.size))
  const anyInStock       = product.variants.some(v => v.in_stock)

  // Imagen: specific_image_url del primer variant del color, si no la del producto
  const variantImg = variantsForColor[0]?.specific_image_url
  const imgSrc     = variantImg ?? (product.has_image ? `/api/images/products/${product.id}` : null)

  const handleColorClick = (color: string) => {
    setSelColor(color)
    setImgKey(k => k + 1)
  }

  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hola! Me interesa: *${product.name}*${selColor && selColor !== 'Varios' ? ` — Color: ${selColor}` : ''} — Precio: ${fmt(product.price)}`
      )}`
    : null

  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 flex flex-col">

      {/* Imagen */}
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        {imgSrc ? (
          <img
            key={imgKey}
            src={imgSrc}
            alt={product.name}
            className="w-full h-full object-cover transition-opacity duration-300 group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-pink-100">
            <span className="text-5xl font-bold text-violet-300 select-none">
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Badge de disponibilidad */}
        <div className="absolute top-2.5 left-2.5">
          {anyInStock
            ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500 text-white shadow-sm">
                Disponible
              </span>
            : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-400 text-white shadow-sm">
                Sin stock
              </span>
          }
        </div>

        {/* Categoría */}
        {product.category && (
          <div className="absolute top-2.5 right-2.5">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 shadow-sm">
              {product.category}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* Nombre */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">{product.name}</h3>
          {product.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{product.description}</p>
          )}
        </div>

        {/* Precio */}
        <p className="text-xl font-bold text-gray-900 tracking-tight">{fmt(product.price)}</p>

        {/* Círculos de color */}
        {colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {colors.map(color => {
              const css     = colorToCss(color)
              const isVarios = color.toLowerCase() === 'varios'
              const isSel   = selColor === color
              const hasStock = product.variants.some(v => v.color === color && v.in_stock)

              return (
                <button
                  key={color}
                  title={color}
                  onClick={() => handleColorClick(color)}
                  className={`relative w-6 h-6 rounded-full border-2 transition-all duration-150 focus:outline-none
                    ${isSel
                      ? 'border-violet-500 scale-110 shadow-md'
                      : 'border-transparent hover:border-gray-300 hover:scale-105'
                    }
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

        {/* Color seleccionado */}
        {selColor && selColor.toLowerCase() !== 'varios' && (
          <p className="text-xs text-gray-500 -mt-1">Color: <span className="font-medium text-gray-700">{selColor}</span></p>
        )}

        {/* Talles disponibles */}
        {sizes.length > 0 && !(sizes.length === 1 && sizes[0] === 'X') && (
          <div className="flex flex-wrap gap-1">
            {sizes.map(size => {
              const inStock = inStockSizes.has(size)
              return (
                <span
                  key={size}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border
                    ${inStock
                      ? 'border-gray-300 text-gray-700 bg-white'
                      : 'border-gray-200 text-gray-300 line-through bg-gray-50'
                    }`}
                >
                  T.{size}
                </span>
              )
            })}
          </div>
        )}

        {/* Botón WhatsApp */}
        <div className="mt-auto pt-1">
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150
                ${anyInStock
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-default pointer-events-none'
                }`}
            >
              <MessageCircle className="h-4 w-4" />
              {anyInStock ? 'Consultar' : 'Sin stock'}
            </a>
          ) : (
            <div className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold
              ${anyInStock ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}>
              <ShoppingBag className="h-4 w-4" />
              {anyInStock ? 'Disponible' : 'Sin stock'}
            </div>
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
  const [data,        setData       ] = useState<CatalogData | null>(null)
  const [loading,     setLoading    ] = useState(true)
  const [selCategory, setSelCategory] = useState<string>('__all__')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [search,      setSearch     ] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

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
            <a
              href="https://wa.me/541131005865"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              WhatsApp →
            </a>
          </span>
        ),
        duration: 10000,
      })
    }
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
                <a
                  href={`https://wa.me/${store.whatsapp}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-green-600 hover:text-green-700 font-medium"
                >
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
          <img
            src="/api/images/banner"
            alt="Banner de la tienda"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* ── Info de la tienda ──────────────────────────────────────────────── */}
      {store?.banner_text && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-1.5">
              {store.banner_text.split('\n').filter(l => l.trim()).map((line, i) => (
                <span key={i} className="text-sm text-gray-700 whitespace-pre">
                  {line.trim()}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Barra de filtros ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">

          {/* Búsqueda */}
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
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearch('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Categorías (scroll horizontal) */}
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1">
            {[{ label: 'Todo', val: '__all__' }, ...(data?.categories ?? []).map(c => ({ label: c, val: c }))].map(({ label, val }) => (
              <button
                key={val}
                onClick={() => setSelCategory(val)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0
                  ${selCategory === val
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Toggle En stock + filtros mobile */}
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

        {/* Categorías mobile (desplegable) */}
        {filtersOpen && (
          <div className="sm:hidden px-4 pb-3 flex flex-wrap gap-1.5">
            {[{ label: 'Todo', val: '__all__' }, ...(data?.categories ?? []).map(c => ({ label: c, val: c }))].map(({ label, val }) => (
              <button
                key={val}
                onClick={() => { setSelCategory(val); setFiltersOpen(false) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${selCategory === val
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Grid de productos ──────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* Contador */}
        {!loading && (
          <p className="text-sm text-gray-400 mb-5">
            {filtered.length === 0
              ? 'No hay productos que coincidan'
              : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`
            }
            {selCategory !== '__all__' && ` en ${selCategory}`}
            {search && ` · "${search}"`}
          </p>
        )}

        {/* Skeleton loading */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white shadow-sm animate-pulse">
                <div className="aspect-[3/4] bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-6 bg-gray-200 rounded w-1/3" />
                  <div className="flex gap-1.5">
                    {[1,2,3].map(j => <div key={j} className="w-6 h-6 rounded-full bg-gray-200" />)}
                  </div>
                  <div className="h-9 bg-gray-200 rounded-xl mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Productos */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                waNumber={store?.whatsapp ?? null}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && !loading && (
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

          {/* Info del negocio */}
          <div className="space-y-1">
            <p className="font-semibold text-gray-700">{store?.name}</p>
            {store?.address && <p className="text-sm text-gray-400">{store.address}</p>}
            {store?.phone   && <p className="text-sm text-gray-400">{store.phone}</p>}
          </div>

          {/* Redes sociales */}
          <div className="space-y-3">
            <p className="text-sm text-gray-500 font-medium">¡No te pierdas las novedades!</p>
            <div className="flex items-center justify-center gap-5">

              {/* Instagram */}
              <a href="https://instagram.com/malema.ba" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="Instagram @malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>

              {/* Facebook */}
              <a href="https://facebook.com/malema.ba" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="Facebook malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>

              {/* TikTok */}
              <a href="https://tiktok.com/@malema.ba" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="TikTok @malema.ba">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/>
                </svg>
              </a>

              {/* YouTube */}
              <a href="https://youtube.com/@MALEMA.STOREBA" target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors" title="YouTube @MALEMA.STOREBA">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>

            </div>
          </div>

          {/* Trabajá con nosotros */}
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
