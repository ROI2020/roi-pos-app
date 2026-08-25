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
  price:            number   // precio efectivo al momento de agregar (promo si aplica)
  cuotas:           number
}

interface CartContextValue {
  items:       CartItem[]
  itemCount:   number
  total:       number
  isOpen:      boolean
  addItem:     (item: CartItem) => void
  removeItem:  (variantId: number) => void
  clearCart:   () => void
  openCart:    () => void
  closeCart:   () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = 'roipos_cart'

function readStorage(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

function writeStorage(items: CartItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* no-op */ }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items,  setItems ] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Leer localStorage al montar (solo cliente)
  useEffect(() => { setItems(readStorage()) }, [])

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      // Evitar duplicados (mismo variantId = misma unidad física)
      if (prev.some(i => i.variantId === item.variantId)) return prev
      const next = [...prev, item]
      writeStorage(next)
      return next
    })
    setIsOpen(true)
  }, [])

  const removeItem = useCallback((variantId: number) => {
    setItems(prev => {
      const next = prev.filter(i => i.variantId !== variantId)
      writeStorage(next)
      return next
    })
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    writeStorage([])
  }, [])

  const itemCount = items.length
  const total     = items.reduce((s, i) => s + i.price, 0)

  return (
    <CartContext.Provider value={{
      items, itemCount, total, isOpen,
      addItem, removeItem, clearCart,
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
