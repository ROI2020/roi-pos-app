export interface Variant {
  id: number; sku: string; color: string; size: string
  specific_image_url: string | null; in_stock: boolean; stock_count: number
}
export interface Product {
  id: number; name: string; description: string | null
  price: number; category: string | null; age_group: string | null
  has_image: boolean; today_promo: string | null
  variants: Variant[]
}
export interface StoreData {
  name: string | null; logo: string | null
  address: string | null; phone: string | null; whatsapp: string | null
  has_banner: boolean; banner_text: string | null; shipping_info: string | null
}
export interface CatalogData {
  store: StoreData; categories: string[]; age_groups: string[]; products: Product[]
}
export interface SuggestionProduct {
  id: number; name: string; price: number; category: string | null
  has_image: boolean; specific_image_url: string | null
  stock_total: number; sold_30d: number; reason: 'complementary' | 'trending'
}
