import type { ResolvedMediaAsset } from '~/server/utils/media-asset-manager'
import type { Price, PriceInput } from '~/shared/prices'
import type { SocialImageSource } from '~/utils/social-metadata'

export interface ProductDetail {
  key: string
  label: string
  values: string[]
}

export type ProductSource = 'manual' | 'template' | 'ai' | 'import' | 'copy'

export interface ProductCategory {
  id: string
  location_id: string
  name: string
  slug: string
  sort_order: number
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

/** The category as it is carried on a read. Writes reference it by category_id. */
export interface ProductCategoryRef {
  id: string
  name: string
  slug: string
  sort_order: number
}

export interface Product {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  product_type: 'standard' | 'experience'
  category_id: string
  category: ProductCategoryRef
  name: string
  slug: string
  description: string
  price: Price | null
  scheduled_prices?: Price[]
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
  media: ResolvedMediaAsset[]
  social_image: SocialImageSource | null
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
  category_id: string
  name: string
  description?: string
  price: PriceInput | null
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
  name?: string
  description?: string
  price?: PriceInput | null
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

export interface MoveProductsInput {
  product_ids: string[]
  category_id: string
}

/** The complete intended order. Partial orders are rejected. */
export interface ReorderProductsInput {
  category_id: string
  product_ids: string[]
}

export interface ReorderProductCategoriesInput {
  category_ids: string[]
}

export interface CreateProductCategoryInput {
  name: string
}

export interface RenameProductCategoryInput {
  name: string
}

export type SyncProductInput = CreateProductInput & { product_id?: string }

/**
 * What AI extraction produces: a category *name*, because the model reads a
 * printed menu and cannot know category IDs. The import layer resolves these
 * to real categories before any Product is written.
 */
export type ExtractedProductCandidate = Omit<CreateProductInput, 'category_id'> & { category: string }

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
