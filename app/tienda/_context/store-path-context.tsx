"use client"

/**
 * StorePathContext
 *
 * Provee el base path público de la tienda:
 *   '/store'  → negocios en inglés (USA)
 *   '/tienda' → negocios en español (Argentina)
 *
 * Todos los links y navegaciones del lado cliente usan useStoreHref()
 * para que la URL en el browser sea siempre la correcta según el dominio.
 *
 * El middleware reescribe internamente /store/* → /tienda/* para que
 * Next.js sirva siempre desde app/tienda/, pero el browser ve /store/*.
 */

import { createContext, useContext, type ReactNode } from 'react'

const StorePathContext = createContext('/tienda')

export function StorePathProvider({
  basePath,
  children,
}: {
  basePath: string
  children: ReactNode
}) {
  return (
    <StorePathContext.Provider value={basePath}>
      {children}
    </StorePathContext.Provider>
  )
}

/**
 * Devuelve el base path de la tienda: '/store' o '/tienda'.
 * Usarlo cuando se necesita el base solo (ej: comparar con pathname).
 */
export function useStorePath(): string {
  return useContext(StorePathContext)
}

/**
 * Devuelve la URL completa dentro de la tienda.
 * path debe empezar con '/', ej: '/checkout', '/checkout/exito'.
 * Pasar '' para la raíz de la tienda.
 *
 * @example
 *   useStoreHref('/checkout')  // → '/store/checkout' o '/tienda/checkout'
 *   useStoreHref('')           // → '/store' o '/tienda'
 */
export function useStoreHref(path: string): string {
  const base = useContext(StorePathContext)
  return base + path
}
