import type { Product } from './_types'
export { createFmt } from '@/lib/currency'

export const COLOR_CSS: Record<string, string> = {
  // Español
  negro: '#111827', 'negro brillante': '#000', blanco: '#f9fafb', 'blanco roto': '#fef9ef',
  rojo: '#dc2626', 'rojo oscuro': '#991b1b', rosa: '#ec4899', 'rosa chicle': '#f472b6',
  'rosa pastel': '#fce7f3', azul: '#2563eb', 'azul marino': '#1e3a8a', celeste: '#7dd3fc',
  'azul cielo': '#38bdf8', verde: '#16a34a', 'verde militar': '#4d7c0f', 'verde agua': '#06b6d4',
  menta: '#6ee7b7', amarillo: '#eab308', 'amarillo mostaza': '#a16207', naranja: '#f97316',
  violeta: '#7c3aed', lila: '#c084fc', 'lila pastel': '#ede9fe', gris: '#9ca3af',
  'gris oscuro': '#374151', 'gris claro': '#e5e7eb', beige: '#d4b896', crema: '#fef3c7',
  bordo: '#881337', 'bordo oscuro': '#4c0519', salmon: '#fb7185', terracota: '#b45309',
  'color carne': '#d4a574', chocolate: '#6b3a2a', camel: '#c19a6b',
  // English (CJ Dropshipping and other suppliers)
  black: '#111827', white: '#f9fafb', red: '#dc2626', pink: '#ec4899',
  blue: '#2563eb', navy: '#1e3a8a', green: '#16a34a', yellow: '#eab308',
  orange: '#f97316', purple: '#7c3aed', gray: '#9ca3af', grey: '#9ca3af',
  brown: '#6b3a2a', cream: '#fef3c7', gold: '#ca8a04', silver: '#94a3b8',
  khaki: '#a16207', burgundy: '#881337', coral: '#fb7185', mint: '#6ee7b7',
  teal: '#0d9488', cyan: '#06b6d4', indigo: '#4338ca', rose: '#f43f5e',
  'off white': '#fef9ef', 'sky blue': '#38bdf8', 'light blue': '#7dd3fc',
  'navy blue': '#1e3a8a', 'royal blue': '#1d4ed8', 'baby blue': '#bfdbfe',
  'dark green': '#166534', 'army green': '#4d7c0f', 'olive green': '#65a30d',
  'light gray': '#e5e7eb', 'light grey': '#e5e7eb', 'dark gray': '#374151',
  'dark grey': '#374151', 'charcoal gray': '#374151', 'charcoal grey': '#374151',
  'rose gold': '#f59e8c', 'dark brown': '#3b1f15', 'light pink': '#fce7f3',
  'hot pink': '#f472b6', 'deep red': '#991b1b', 'wine red': '#881337',
  tan: '#d4b896', nude: '#d4a574', apricot: '#fb923c',
}

export function colorToCss(name: string): string | null {
  if (!name) return null
  const k = name.toLowerCase().trim()
  if (k === 'varios') return null
  // Exact match first; for compound names like "black yellow" fall back to first word
  return COLOR_CSS[k] ?? COLOR_CSS[k.split(' ')[0]] ?? null
}

/**
 * Formatter de moneda ARS para compatibilidad con imports existentes.
 * En la tienda pública usá createFmt(store.currency, store.locale)
 * para respetar la moneda/locale del negocio.
 */
export const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

export const SIZE_ORDER = [
  'XS','S','M','L','XL','XXL','XXXL','X','U','TU',
  '00','0','1','2','3','4','5','6','7','8','9',
  '10','11','12','13','14','15','16','17','18','19','20',
  '22','24','26','28','30','32','34','36','38','40',
]

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a); const ib = SIZE_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1; if (ib !== -1) return 1
    return a.localeCompare(b, 'es', { numeric: true })
  })
}

export function totalStock(product: Product): number {
  return product.variants.reduce((acc, v) => acc + v.stock_count, 0)
}
