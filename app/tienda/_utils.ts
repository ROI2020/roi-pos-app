import type { Product } from './_types'
export { createFmt } from '@/lib/currency'

export const COLOR_CSS: Record<string, string> = {
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

export function colorToCss(name: string): string | null {
  if (!name) return null
  const k = name.toLowerCase().trim()
  if (k === 'varios') return null
  return COLOR_CSS[k] ?? null
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
