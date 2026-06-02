/**
 * Parsea un string de talles y devuelve el array de talles individuales.
 *
 * Formato:  "DESDE-HASTA"  o  "DESDE-HASTA,REFUERZO1,REFUERZO2,..."
 *
 * Regla de paso (auto-detectada):
 *   - Ambos extremos pares y el inicial >= 4  →  paso 2  (niños: 4,6,8,10…)
 *   - Cualquier otro caso                     →  paso 1  (bebés: 0,1,2,3…)
 *
 * Ejemplos:
 *   "4-16"       → [4,6,8,10,12,14,16]         (7 prendas)
 *   "10-18"      → [10,12,14,16,18]             (5 prendas)
 *   "6-16,10,12" → [6,8,10,10,12,12,14,16]      (8 prendas)
 *   "0-5"        → [0,1,2,3,4,5]               (6 prendas)
 *   "1-6"        → [1,2,3,4,5,6]               (6 prendas)
 */
export function parseTalles(input: string): number[] {
  const raw = input.trim()
  if (!raw) return []

  const parts = raw.split(',').map(s => s.trim())
  const rangePart = parts[0]
  const extras = parts
    .slice(1)
    .map(Number)
    .filter(n => Number.isInteger(n) && n >= 0)

  const base: number[] = []

  if (rangePart.includes('-')) {
    const [aStr, bStr] = rangePart.split('-')
    const a = Number(aStr)
    const b = Number(bStr)
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= a) {
      const paso = a % 2 === 0 && b % 2 === 0 && a >= 4 ? 2 : 1
      for (let t = a; t <= b; t += paso) base.push(t)
    }
  } else {
    const n = Number(rangePart)
    if (Number.isInteger(n) && n >= 0) base.push(n)
  }

  return [...base, ...extras].sort((a, b) => a - b)
}
