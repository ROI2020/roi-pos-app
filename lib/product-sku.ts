/**
 * lib/product-sku.ts
 * GID único de producto para Google Shopping (feed) y JSON-LD.
 * Mismo criterio en ambos lugares: ds-${id} para DS/CJ, sku para físicos, p-${id} fallback.
 */
export function makeProductGid(
  productId: number,
  sku:       string | null | undefined,
  isDS:      boolean,
): string {
  if (isDS) return `ds-${productId}`
  if (sku)  return sku
  return `p-${productId}`
}
