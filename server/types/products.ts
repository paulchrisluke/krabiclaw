import type { ResolvedMediaAsset } from '~/server/utils/media-asset-manager'
import type { Price, PriceInput } from '~/shared/prices'
import type { MetafieldValue } from '~/shared/metafields'
import type { SocialImageSource } from '~/utils/social-metadata'

export type ProductSource = 'manual' | 'template' | 'ai' | 'import' | 'copy'

/** One buyable configuration. A product with no options still has one. */
export interface ProductVariant {
  id: string
  product_id: string
  name: string
  sku: string | null
  active: boolean
  sort_order: number
  /** Which value this variant selects for each of the product's options. */
  option_values: Record<string, string>
  prices: Price[]
}

export interface ProductOptionValue {
  id: string
  value: string
  sort_order: number
}

export interface ProductOption {
  id: string
  name: string
  sort_order: number
  values: ProductOptionValue[]
}

/** Site publication state. Absent from the map means the site does not carry it. */
export interface ProductPublication {
  site_id: string
  published: boolean
}

/** Where the product is offered, and under what controls. */
export interface ProductLocation {
  location_id: string
  active: boolean
  published: boolean
}

export interface Collection {
  id: string
  site_id: string
  location_id: string | null
  name: string
  slug: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

/** Membership of one product in one collection, carrying its position there. */
export interface CollectionMembership {
  collection_id: string
  sort_order: number
}

/**
 * Catalog identity. Publication, location, pricing, grouping, stock and
 * booking are relationships hanging off this, never columns on it, so the same
 * product can appear on two sites at two prices without being duplicated.
 */
export interface Product {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string
  /** Merchant sale-enable control. Not visibility, not stock. */
  active: boolean
  order_url: string | null
  /** Stripe `unit_label`: a unit noun such as 'person'. Never pricing prose. */
  unit_label: string | null
  marketing_features: string[]
  tags: string[]
  /** Validated string-to-string annotations. No domain behavior reads this. */
  metadata: Record<string, string>
  tax_code: string | null
  options: ProductOption[]
  variants: ProductVariant[]
  /** Typed descriptive attributes, keyed by '<namespace>.<key>'. */
  metafields: Record<string, MetafieldValue>
  publications: ProductPublication[]
  locations: ProductLocation[]
  collections: CollectionMembership[]
  image: ResolvedMediaAsset | null
  gallery: ResolvedMediaAsset[]
  media: ResolvedMediaAsset[]
  social_image: SocialImageSource | null
  source: ProductSource
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export interface ProductVariantInput {
  id?: string
  name: string
  sku?: string | null
  active?: boolean
  sort_order?: number
  /** option id -> option value id. Must answer every option exactly once. */
  option_values?: Record<string, string>
  prices?: PriceInput[]
}

export interface ProductOptionInput {
  id?: string
  name: string
  sort_order?: number
  values: { id?: string; value: string; sort_order?: number }[]
}

export interface CreateProductInput {
  name: string
  description?: string
  active?: boolean
  order_url?: string | null
  unit_label?: string | null
  marketing_features?: string[]
  tags?: string[]
  metadata?: Record<string, string>
  tax_code?: string | null
  options?: ProductOptionInput[]
  /** Omitted means one default variant is created. */
  variants?: ProductVariantInput[]
  metafields?: Record<string, MetafieldValue>
  source?: ProductSource
}

export type UpdateProductInput = Partial<Omit<CreateProductInput, 'source'>>

export interface SetProductPublicationInput {
  site_id: string
  published: boolean
}

export interface SetProductLocationInput {
  location_id: string
  active?: boolean
  published?: boolean
}

export interface CreateCollectionInput {
  site_id: string
  location_id?: string | null
  name: string
  description?: string | null
  sort_order?: number
}

export interface UpdateCollectionInput {
  name?: string
  description?: string | null
  sort_order?: number
}

/** The complete intended membership and order. Partial orders are rejected. */
export interface SetCollectionProductsInput {
  collection_id: string
  product_ids: string[]
}

export interface ReorderCollectionsInput {
  site_id: string
  location_id?: string | null
  collection_ids: string[]
}

export type ReconcileProductInput = CreateProductInput & { product_id?: string }

export interface ProductPresentation {
  feature: 'products'
  collectionPath: '/menu' | '/products'
  locationCollectionSegment: 'menu' | 'products'
  productPath: (_locationSlug: string, _productSlug: string) => string
  collectionLabel: 'Menu' | 'Products'
  itemLabel: 'Dish' | 'Product'
  // English plurals are irregular enough here ("Dish" -> "Dishes",
  // "Collection" -> "Collections") that appending an "s" produces visible typos.
  itemLabelPlural: 'Dishes' | 'Products'
  collectionGroupLabel: 'Section' | 'Collection'
  collectionGroupLabelPlural: 'Sections' | 'Collections'
  structuredDataType: 'MenuItem' | 'Product'
}
