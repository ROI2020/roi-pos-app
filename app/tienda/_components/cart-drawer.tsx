"use client"

import { useEffect } from "react"
import { X, ShoppingCart, Trash2, ArrowRight, Package } from "lucide-react"
import { useTranslations } from 'next-intl'
import { useCart }        from "../_context/cart-context"
import { useCurrency }    from "../_context/currency-context"
import { useStoreHref }   from "../_context/store-path-context"
import Link from "next/link"

export default function CartDrawer() {
  const { items, total, isOpen, closeCart, removeItem } = useCart()
  const { fmt }     = useCurrency()
  const t           = useTranslations('Cart')
  const checkoutHref = useStoreHref('/checkout')

  // Lock scroll cuando el drawer está abierto
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeCart} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-sm bg-white flex flex-col h-full shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-violet-600" />
            <h2 className="font-semibold text-gray-900">
              {t('title')}
              {items.length > 0 && (
                <span className="ml-2 text-xs font-medium bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                  {t('itemCount', { count: items.length })}
                </span>
              )}
            </h2>
          </div>
          <button onClick={closeCart} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300 px-6">
              <Package className="h-14 w-14" />
              <p className="text-base text-gray-400 text-center">{t('empty')}</p>
              <button onClick={closeCart}
                className="text-sm text-violet-500 hover:text-violet-700 font-medium transition-colors">
                {t('keepShopping')}
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map(item => (
                <li key={item.variantId} className="flex gap-3 px-5 py-4">
                  {/* Imagen */}
                  <div className="w-16 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    {item.specificImageUrl ? (
                      <img src={item.specificImageUrl} alt={item.productName}
                        className="w-full h-full object-cover" loading="lazy" />
                    ) : item.hasImage ? (
                      <img src={`/api/images/products/${item.productId}`} alt={item.productName}
                        className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-pink-100">
                        <span className="text-xl font-bold text-violet-300">
                          {item.productName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.color !== 'Varios' && `${item.color} · `}{t('size', { size: item.size })}
                    </p>
                    <p className="text-sm font-bold text-violet-700 mt-1">{fmt(item.price)}</p>
                    {item.cuotas > 0 && (
                      <p className="text-[11px] text-gray-400">
                        {t('installments', { cuotas: item.cuotas, price: fmt(Math.round(item.price / item.cuotas)) })}
                      </p>
                    )}
                  </div>

                  {/* Quitar */}
                  <button onClick={() => removeItem(item.variantId)}
                    className="shrink-0 text-gray-300 hover:text-red-400 transition-colors self-start mt-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t px-5 py-4 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('subtotal')}</span>
              <span className="text-lg font-bold text-gray-900">{fmt(total)}</span>
            </div>
            <p className="text-xs text-gray-400">{t('shippingNote')}</p>
            <Link href={checkoutHref} onClick={closeCart}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors shadow-lg shadow-violet-200">
              {t('goToCheckout')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
