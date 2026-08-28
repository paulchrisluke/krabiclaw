import type { ResolvedMediaAsset } from '~/server/utils/media-asset-manager'

export interface ProductDetail {
  key: string
  label: string
  values: string[]
}

export type ProductSource = 'manual' | 'template' | 'ai' | 'import' | 'copy'

export interface Product {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  category: string
  name: string
  slug: string
  description: string
  price_amount: string
  compare_at_price_amount: string | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  order_url: string | null
  is_visible: boolean
  available: boolean
  featured: boolean
  featured_sort_order: number
  sort_order: number
  tags: string[]
  details: ProductDetail[]
  image: ResolvedMediaAsset | null
  gallery: ResolvedMediaAsset[]
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  source: ProductSource
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export interface CreateProductInput {
  category: string
  name: string
  description?: string
  price_amount: string | number
  compare_at_price_amount?: string | number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  order_url?: string | null
  is_visible?: boolean
  available?: boolean
  featured?: boolean
  featured_sort_order?: number
  sort_order?: number
  tags?: string[]
  details?: ProductDetail[]
  seo_title?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  robots?: string | null
  source?: ProductSource
}

export interface UpdateProductInput {
  category?: string
  name?: string
  description?: string
  price_amount?: string | number
  compare_at_price_amount?: string | number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  order_url?: string | null
  is_visible?: boolean
  available?: boolean
  featured?: boolean
  featured_sort_order?: number
  sort_order?: number
  tags?: string[]
  details?: ProductDetail[]
  seo_title?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  robots?: string | null
}

export interface ReorderProductsInput {
  products: Array<{ id: string; sort_order: number }>
}

export interface RenameProductCategoryInput {
  old_category: string
  new_category: string
}

export interface DeleteProductCategoryInput {
  category: string
}

export type SyncProductInput = CreateProductInput & { product_id?: string }

export interface ProductPresentation {
  feature: 'products'
  collectionPath: '/menu' | '/products'
  locationCollectionSegment: 'menu' | 'products'
  productPath: (_locationSlug: string, _productSlug: string) => string
  collectionLabel: 'Menu' | 'Products'
  itemLabel: 'Dish' | 'Product'
  categoryLabel: 'Section' | 'Category'
  structuredDataType: 'MenuItem' | 'Product'
}
