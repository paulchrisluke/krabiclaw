import type { CurrencyCode } from './currencies.ts'
import type { InventoryAvailability } from './inventory.ts'
import type { PriceTaxBehavior, PriceUnit } from './prices.ts'

export const CATALOG_CHANNELS = ['seo', 'ordering'] as const
export type CatalogChannel = typeof CATALOG_CHANNELS[number]

export const CATALOG_PROVIDER_RESOURCE_TYPES = ['product', 'price', 'modifier_group', 'modifier_option'] as const
export type CatalogProviderResourceType = typeof CATALOG_PROVIDER_RESOURCE_TYPES[number]

export interface CatalogProviderMapping {
  id: string
  resource_type: CatalogProviderResourceType
  resource_id: string
  provider: string
  provider_account_reference: string | null
  external_id: string
}

export interface MenuPlacement {
  id: string
  location_id: string
  product_id: string
  section: string
  sort_order: number
  is_published: boolean
  featured: boolean
  featured_sort_order: number
}

export interface ProductChannelAvailability {
  id: string
  location_id: string
  product_id: string
  channel: CatalogChannel
  is_available: boolean
}

export interface ModifierOption {
  id: string
  modifier_group_id: string
  name: string
  price_delta_minor: number
  sort_order: number
  is_active: boolean
  provider_mappings: CatalogProviderMapping[]
}

export interface ModifierGroup {
  id: string
  name: string
  minimum_selections: number
  maximum_selections: number
  sort_order: number
  is_active: boolean
  options: ModifierOption[]
  provider_mappings: CatalogProviderMapping[]
}

export interface ModifierOptionInput {
  id?: string
  name: string
  price_delta_minor?: number
  is_active?: boolean
}

export interface ModifierGroupInput {
  id?: string
  name: string
  minimum_selections?: number
  maximum_selections?: number
  is_active?: boolean
  options: ModifierOptionInput[]
}

export interface CatalogAvailabilityInput {
  seo?: boolean
  ordering?: boolean
}

interface OrderingAvailabilityInput {
  channel_availability: readonly Pick<ProductChannelAvailability, 'channel' | 'is_available'>[]
  inventory: Pick<InventoryAvailability, 'status' | 'available_quantity'> | null
}

export function isProductAvailableForOrdering(product: OrderingAvailabilityInput, quantity = 1): boolean {
  return Number.isSafeInteger(quantity)
    && quantity > 0
    && product.channel_availability.some(channel => channel.channel === 'ordering' && channel.is_available)
    && product.inventory?.status === 'available'
    && product.inventory.available_quantity >= quantity
}

export function projectProductOrderingAvailability<T extends OrderingAvailabilityInput & { available: boolean }>(product: T): T {
  return { ...product, available: isProductAvailableForOrdering(product) }
}

export interface CatalogLineModifierSnapshot {
  modifier_group_id: string
  modifier_group_name: string
  modifier_option_id: string
  modifier_option_name: string
  price_delta_minor: number
  provider_mappings: CatalogProviderMapping[]
}

export interface CatalogLineItemSnapshot {
  product_id: string
  price_id: string
  product_name: string
  unit_amount_minor: number
  currency: CurrencyCode
  unit: PriceUnit
  tax_behavior: PriceTaxBehavior
  modifiers: CatalogLineModifierSnapshot[]
  product_provider_mappings: CatalogProviderMapping[]
  price_provider_mappings: CatalogProviderMapping[]
}
