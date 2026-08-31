export interface Variant {
  id: number; sku: string; color: string; size: string
  specific_image_url: string | null; in_stock: boolean; stock_count: number
}
export interface Product {
  id: number; name: string; description: string | null
  price: number; cuotas: number; category: string | null; age_group: string | null
  has_image: boolean; today_promo: string | null; promo_price: number | null
  variants: Variant[]
  /** Mapa color → product_images.id para cargar /api/images/product-images/[id] */
  images_by_color: Record<string, number>
}
export interface StoreData {
  name: string | null; logo: string | null
  address: string | null; phone: string | null; whatsapp: string | null
  has_banner: boolean; banner_text: string | null; shipping_info: string | null
  /** HTML animado para el banner (iframe srcDoc). Si está presente, reemplaza al banner imagen. */
  html_banner: string | null
  /** Cuotas sin interés habilitadas para este negocio (0 = no mostrar badge). */
  cuotas: number
  /** Texto libre del pie de página de la tienda (configurable en settings). */
  footer_text: string | null
  /** ISO 4217: 'ARS', 'USD', etc. — para formatear precios. Default 'ARS'. */
  currency: string
  /** BCP 47: 'es-AR', 'en-US', etc. — para Intl.NumberFormat. Default 'es-AR'. */
  locale: string
}
export interface CatalogData {
  store: StoreData; categories: string[]; age_groups: string[]; products: Product[]
}
export interface SuggestionProduct {
  id: number; name: string; price: number; category: string | null
  has_image: boolean; specific_image_url: string | null
  stock_total: number; sold_30d: number; reason: 'complementary' | 'trending'
}
