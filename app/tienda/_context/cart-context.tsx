"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface CartItem {
  variantId:        number
  productId:        number
  productName:      string
  variantSku:       string
  color:            string
  size:             string
  specificImageUrl: string | null
  hasImage:         boolean
  price:            number   // precio unitario al momento de agregar (promo si aplica)
  cuotas:           number
  quantity:         number   // unidades de este variant en el carrito
  /** Opciones de envío CJ del producto (vacío para productos locales). */
  freightOptions?:  import('../_types').CJFreightOption[]
}

interface CartContextValue {
  items:          CartItem[]
  itemCount:      number
  total:          number
  isOpen:         boolean
  addItem:        (item: CartItem) => void
  removeItem:     (variantId: number) => void
  updateQuantity: (variantId: number, quantity: number) => void  // 0 = eliminar
  clearCart:      () => void
  openCart:       () => void
  closeCart:      () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | null>(null)

const BASE_KEY = 'roipos_cart'

function storageKey(businessId?: number | null) {
  return businessId ? `${BASE_KEY}_${businessId}` : BASE_KEY
}

function readStorage(key: string): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartItem[]
    // Sanitizar items viejos que no tienen quantity (antes de la implementación de Phase 6)
    return parsed
      .filter(i => i && typeof i.variantId === 'number')
      .map(i => ({ ...i, quantity: (typeof i.quantity === 'number' && i.quantity > 0) ? i.quantity : 1 }))
  } catch {
    return []
  }
}

function writeStorage(key: string, items: CartItem[]) {
  try { localStorage.setItem(key, JSON.stringify(items)) } catch { /* no-op */ }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function CartProvider({
  children,
  businessId,
}: {
  children:   React.ReactNode
  businessId?: number | null
}) {
  const [items,  setItems ] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Clave namespaceada por negocio — aísla carritos en dev (localhost compartido)
  // En prod cada negocio corre en su propio dominio, localStorage ya es independiente.
  const sKey = storageKey(businessId)

  // Leer localStorage al montar (solo cliente)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(readStorage(sKey)) }, [sKey])

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      const exists = prev.find(i => i.variantId === item.variantId)
      let next: CartItem[]
      if (exists) {
        // Si ya está en el carrito, incrementar cantidad
        next = prev.map(i =>
          i.variantId === item.variantId
            ? { ...i, quantity: Math.min(i.quantity + 1, 99) }
            : i
        )
      } else {
        next = [...prev, { ...item, quantity: item.quantity ?? 1 }]
      }
      writeStorage(sKey, next)
      return next
    })
    setIsOpen(true)
  }, [sKey])

  const removeItem = useCallback((variantId: number) => {
    setItems(prev => {
      const next = prev.filter(i => i.variantId !== variantId)
      writeStorage(sKey, next)
      return next
    })
  }, [sKey])

  const updateQuantity = useCallback((variantId: number, quantity: number) => {
    setItems(prev => {
      let next: CartItem[]
      if (quantity <= 0) {
        next = prev.filter(i => i.variantId !== variantId)
      } else {
        next = prev.map(i =>
          i.variantId === variantId
            ? { ...i, quantity: Math.min(quantity, 99) }
            : i
        )
      }
      writeStorage(sKey, next)
      return next
    })
  }, [sKey])

  const clearCart = useCallback(() => {
    setItems([])
    writeStorage(sKey, [])
  }, [sKey])

  const itemCount = items.reduce((s, i) => s + i.quantity, 0)
  const total     = items.reduce((s, i) => s + i.price * i.quantity, 0)

  return (
    <CartContext.Provider value={{
      items, itemCount, total, isOpen,
      addItem, removeItem, updateQuantity, clearCart,
      openCart:  () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
    }}>
      {children}
    </CartContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
