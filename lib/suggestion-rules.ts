/**
 * Motor de sugerencias — Reglas de complementariedad entre categorías.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CÓMO EDITAR                                                             │
 * │  • Cada entrada tiene `when` (keywords de la categoría del producto     │
 * │    que se está mirando) y `suggest` (categorías a recomendar).          │
 * │  • El matching es por subcadena, case-insensitive.                      │
 * │  • Adaptá los keywords a los nombres de categoría reales de la tienda.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Estrategias implementadas (v1):
 *   ✅ complementary — categorías que combinan bien con la vista
 *   ✅ trending      — más vendidos últimos 30 días (señal del servidor)
 *
 * Estrategias futuras planeadas:
 *   🔜 new_arrivals    — incorporados recientemente al catálogo
 *   🔜 promo           — con descuento / precio especial activo
 *   🔜 bought_together — co-compras (cuando se tengan carritos reales)
 *   🔜 best_margin     — mayor margen para el negocio (uso interno)
 *   🔜 stock_clearance — bajo stock, prioridad de salida
 */

export interface PairingRule {
  /** Keywords que identifican la categoría del producto visto */
  when:    string[]
  /** Keywords de las categorías complementarias a sugerir */
  suggest: string[]
}

// ──────────────────────────────────────────────────────────────────────────────
// Tabla de pares complementarios
// ──────────────────────────────────────────────────────────────────────────────
export const PAIRINGS: PairingRule[] = [
  {
    when:    ['jean', 'jeans', 'pantalón', 'pantalon', 'cargo', 'chino', 'jogger'],
    suggest: ['remera', 'camiseta', 'campera', 'buzo', 'sweater', 'polar',
              'blusa', 'calzado', 'zapatilla', 'chomba', 'musculosa'],
  },
  {
    when:    ['remera', 'camiseta', 'blusa', 'musculosa', 'chomba', 'top'],
    suggest: ['jean', 'pantalón', 'pantalon', 'short', 'calza', 'campera', 'buzo', 'pollera'],
  },
  {
    when:    ['campera', 'buzo', 'sweater', 'polar', 'hoodie', 'abrigo', 'parka', 'chaleco'],
    suggest: ['jean', 'pantalón', 'pantalon', 'remera', 'camiseta', 'calza', 'jogging'],
  },
  {
    when:    ['short', 'shorts', 'bermuda'],
    suggest: ['remera', 'camiseta', 'musculosa', 'calzado', 'zapatilla', 'campera', 'buzo'],
  },
  {
    when:    ['calza', 'calzas', 'legging', 'jogging', 'lycra'],
    suggest: ['remera', 'campera', 'buzo', 'zapatilla', 'calzado', 'musculosa'],
  },
  {
    when:    ['vestido', 'pollera', 'falda'],
    suggest: ['calzado', 'zapatilla', 'campera', 'blusa', 'remera', 'accesorio', 'cartera'],
  },
  {
    when:    ['zapatilla', 'calzado', 'zapato', 'bota', 'sandalia', 'ojota', 'mocasín'],
    suggest: ['jean', 'pantalón', 'pantalon', 'short', 'vestido', 'calza'],
  },
  {
    when:    ['accesorio', 'cartera', 'bolso', 'cinturón', 'cinturon', 'gorra', 'bufanda', 'gorro'],
    suggest: ['vestido', 'jean', 'remera', 'campera', 'buzo'],
  },
]

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Dada la categoría de un producto, devuelve los keywords de categorías
 * complementarias a sugerir (para usar como patrones ILIKE en SQL).
 * Devuelve null si no hay regla aplicable.
 */
export function getComplementaryKeywords(category: string | null): string[] | null {
  if (!category) return null
  const cat = category.toLowerCase().trim()
  for (const rule of PAIRINGS) {
    if (rule.when.some(kw => cat.includes(kw) || kw.includes(cat))) {
      return rule.suggest
    }
  }
  return null
}

/**
 * Convierte keywords en patrones ILIKE de PostgreSQL ('%keyword%').
 */
export function toIlikePatterns(keywords: string[]): string[] {
  return keywords.map(kw => `%${kw}%`)
}
