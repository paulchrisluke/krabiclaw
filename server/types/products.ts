import type { ResolvedMediaAsset } from '~/server/utils/media-asset-manager'
import type { Price, PriceInput } from '~/shared/prices'
import type {
  CatalogAvailabilityInput,
  CatalogProviderMapping,
  MenuPlacement,
  ModifierGroup,
  ModifierGroupInput,
  ProductChannelAvailability,
} from '~/shared/ordering-catalog'
import type { SocialImageSource } from '~/utils/social-metadata'
import type { InventoryAvailability } from '~/shared/inventory'

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
  product_type: 'standard' | 'experience'
  category: string
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
  menu_placement: MenuPlacement | null
  channel_availability: ProductChannelAvailability[]
  modifier_groups: ModifierGroup[]
  provider_mappings: CatalogProviderMapping[]
  inventory: InventoryAvailability | null
}

export interface CreateProductInput {
  category: string
  name: string
  description?: string
  price: PriceInput
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
  channel_availability?: CatalogAvailabilityInput
  modifier_groups?: ModifierGroupInput[]
}

export interface UpdateProductInput {
  category?: string
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
  channel_availability?: CatalogAvailabilityInput
  modifier_groups?: ModifierGroupInput[]
}

export interface MoveProductsInput {
  product_ids: string[]
  before_product_id: string | null
}

export interface MoveProductCategoryInput {
  category: string
  before_category: string | null
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
