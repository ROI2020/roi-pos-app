/**
 * Tabla de provincias argentinas con los códigos de 1 letra usados por PAQ.AR.
 * IMPORTANTE: estos códigos son distintos de ISO 3166-2 y de los que usa Shopify/otros.
 */
export const PAQAR_PROVINCES = [
  { code: 'C', name: 'CABA' },
  { code: 'B', name: 'Buenos Aires' },
  { code: 'K', name: 'Catamarca' },
  { code: 'H', name: 'Chaco' },
  { code: 'U', name: 'Chubut' },
  { code: 'X', name: 'Córdoba' },
  { code: 'W', name: 'Corrientes' },
  { code: 'E', name: 'Entre Ríos' },
  { code: 'P', name: 'Formosa' },
  { code: 'Y', name: 'Jujuy' },
  { code: 'L', name: 'La Pampa' },
  { code: 'F', name: 'La Rioja' },
  { code: 'M', name: 'Mendoza' },
  { code: 'N', name: 'Misiones' },
  { code: 'Q', name: 'Neuquén' },
  { code: 'R', name: 'Río Negro' },
  { code: 'A', name: 'Salta' },
  { code: 'J', name: 'San Juan' },
  { code: 'D', name: 'San Luis' },
  { code: 'Z', name: 'Santa Cruz' },
  { code: 'S', name: 'Santa Fe' },
  { code: 'G', name: 'Santiago del Estero' },
  { code: 'V', name: 'Tierra del Fuego' },
  { code: 'T', name: 'Tucumán' },
] as const

export type PaqarProvinceCode = typeof PAQAR_PROVINCES[number]['code']

export function provinceName(code: string): string {
  return PAQAR_PROVINCES.find(p => p.code === code)?.name ?? code
}
