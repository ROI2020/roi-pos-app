"use client"

/**
 * lib/analytics.ts — GA4 e-commerce events (client-only).
 *
 * Nunca define window.gtag. Si gtag aún no cargó (script afterInteractive),
 * encola el evento y reintenta cada 300 ms hasta 10 s.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

type GtagItem = {
  item_id:       string | number
  item_name:     string
  item_variant?: string
  price?:        number
  quantity?:     number
}

type GtagParams = Record<string, unknown>

function callGtag(event: string, params: GtagParams): void {
  if (typeof window === 'undefined') return

  const fire = (): boolean => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, params)
      return true
    }
    return false
  }

  if (fire()) return

  let elapsed = 0
  const id = setInterval(() => {
    elapsed += 300
    if (fire() || elapsed >= 10_000) clearInterval(id)
  }, 300)
}

export type AnalyticsItem = {
  productId:   number
  productName: string
  price:       number
  quantity?:   number
  variant?:    string
}

function toGtag(i: AnalyticsItem): GtagItem {
  return {
    item_id:      i.productId,
    item_name:    i.productName,
    ...(i.variant   && { item_variant: i.variant }),
    ...(i.price  !== undefined && { price:    i.price }),
    ...(i.quantity !== undefined && { quantity: i.quantity }),
  }
}

export function trackViewItem(p: {
  productId:   number
  productName: string
  price:       number
  currency:    string
  variant?:    string
}): void {
  callGtag('view_item', {
    currency: p.currency,
    value:    p.price,
    items:    [toGtag({ ...p, quantity: 1 })],
  })
}

export function trackAddToCart(p: {
  productId:   number
  productName: string
  price:       number
  currency:    string
  quantity:    number
  variant?:    string
}): void {
  callGtag('add_to_cart', {
    currency: p.currency,
    value:    p.price * p.quantity,
    items:    [toGtag(p)],
  })
}

export function trackBeginCheckout(p: {
  value:    number
  currency: string
  items:    AnalyticsItem[]
}): void {
  callGtag('begin_checkout', {
    currency: p.currency,
    value:    p.value,
    items:    p.items.map(toGtag),
  })
}

export function trackPurchase(p: {
  transactionId: string | number
  value:         number
  currency:      string
  items:         AnalyticsItem[]
}): void {
  callGtag('purchase', {
    transaction_id: p.transactionId,
    currency:       p.currency,
    value:          p.value,
    items:          p.items.map(toGtag),
  })
}
