import type { RenderedBookingPolicySummary } from '~/server/utils/reservations'
import type { Collection, Product } from '~/server/types/products'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { SocialImageSource } from '~/utils/social-metadata'

export interface PublicShellSite {
  brand_name: string | null
  brand_description: string | null
  media: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url: string | null; kind: string | null }>
  social_image: SocialImageSource | null
  vertical: string | null
  config: { phone: string | null } | null
}

export interface PublicShellLocation {
  [key: string]: ApiValue
  id: string
  slug: string
  title: string
  address?: ApiValue
  city?: ApiValue
  social_image?: SocialImageSource | null
}

export interface PublicShellPayload {
  site: PublicShellSite
  locations: PublicShellLocation[]
  config: Record<string, string>
  googleBusiness: ApiRecord
  locales: { code: string; label: string; is_source: boolean }[]
  hasProducts: boolean
  platformMessages: Record<string, string> | null
}

const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

export const isPublicShellPayload = (value: unknown): value is PublicShellPayload => {
  if (!isRecord(value) || !isRecord(value.site)) return false
  if (!nullableString(value.site.brand_name)) return false
  if (!nullableString(value.site.brand_description)) return false
  if (!Array.isArray(value.site.media) || !value.site.media.every(item => isRecord(item)
    && typeof item.asset_id === 'string' && typeof item.slot === 'string'
    && nullableString(item.public_url) && nullableString(item.thumbnail_url) && nullableString(item.kind))) return false
  if (value.site.social_image !== null && (!isRecord(value.site.social_image) || typeof value.site.social_image.url !== 'string')) return false
  if (!nullableString(value.site.vertical)) return false
  if (value.site.config !== null && !isRecord(value.site.config)) return false
  if (isRecord(value.site.config) && !nullableString(value.site.config.phone)) return false
  if (!Array.isArray(value.locations)
    || !value.locations.every(location =>
      isRecord(location)
      && typeof location.id === 'string'
      && typeof location.slug === 'string'
      && typeof location.title === 'string')) return false
  if (!isRecord(value.config)
    || !Object.values(value.config).every(item => typeof item === 'string')) return false
  if (!isRecord(value.googleBusiness)
    || (value.googleBusiness.business !== null && !isRecord(value.googleBusiness.business))
    || !Array.isArray(value.googleBusiness.reviews)
    || !Array.isArray(value.googleBusiness.media)
    || !Array.isArray(value.googleBusiness.posts)) return false
  if (!Array.isArray(value.locales)
    || !value.locales.every(locale =>
      isRecord(locale)
      && typeof locale.code === 'string'
      && typeof locale.label === 'string'
      && typeof locale.is_source === 'boolean')) return false
  if (value.platformMessages !== null && (!isRecord(value.platformMessages)
    || !Object.values(value.platformMessages).every(message => typeof message === 'string'))) return false
  return typeof value.hasProducts === 'boolean'
}

export interface PublicPagePayload {
  kind: string
  shell: PublicShellPayload
  content: ApiRecord[]
  content_blocks: ApiRecord[]
  tenant_page: PublicTenantPage | null
  locationReviews: ApiRecord[]
  globalReviews: ApiRecord[]
  reviewsAggregate: ApiRecord | null
  reviewsList: ApiRecord[]
  media: ApiRecord[]
  qaList: ApiRecord[]
  postsList: ApiRecord[]
  globalPosts: ApiRecord[]
  blogList: ApiRecord[]
  blogPost: ApiRecord | null
  reservationPolicyByLocation: Record<string, RenderedBookingPolicySummary | null>
  products: Product[]
  collections: Collection[]
  localeRepresentations: PublicLocaleRepresentation[]
}

export interface PublicLocaleRepresentation {
  locale: string
  label: string
  route_path: string
  source: 'source' | 'localized'
}

/**
 * The shape a public surface is allowed to render.
 *
 * Checks the relationships the pages actually read — variants carry the
 * prices, memberships say where the product is offered and grouped — rather
 * than every field, so a payload missing one of them fails here instead of
 * rendering a product with no offer.
 */
export function isPublicProduct(value: unknown): value is Product {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.organization_id === 'string'
    && typeof value.name === 'string'
    && typeof value.slug === 'string'
    && typeof value.description === 'string'
    && typeof value.active === 'boolean'
    && Array.isArray(value.tags)
    && Array.isArray(value.options)
    && Array.isArray(value.variants)
    && value.variants.every(variant => isRecord(variant)
      && typeof variant.id === 'string'
      && typeof variant.name === 'string'
      && Array.isArray(variant.prices))
    && isRecord(value.metafields)
    && Array.isArray(value.locations)
    && value.locations.every(entry => isRecord(entry)
      && typeof entry.location_id === 'string'
      && typeof entry.active === 'boolean'
      && typeof entry.published === 'boolean')
    && Array.isArray(value.collections)
    && value.collections.every(entry => isRecord(entry)
      && typeof entry.collection_id === 'string'
      && Number.isInteger(entry.sort_order))
    && (value.image === null || isRecord(value.image))
    && Array.isArray(value.gallery)
}

export function isPublicCollection(value: unknown): value is Collection {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.site_id === 'string'
    && typeof value.name === 'string'
    && typeof value.slug === 'string'
    && Number.isInteger(value.sort_order)
}

export const isPublicPagePayload = (
  value: unknown,
  expectedKind?: string | null,
): value is PublicPagePayload =>
  isRecord(value)
  && typeof value.kind === 'string'
  && isPublicShellPayload(value.shell)
  && (!expectedKind || value.kind === expectedKind)
  && Array.isArray(value.content)
  && value.content.every(item => isRecord(item) && typeof item.field === 'string')
  && Array.isArray(value.content_blocks)
  && (value.tenant_page === null || (isRecord(value.tenant_page)
    && typeof value.tenant_page.id === 'string'
    && typeof value.tenant_page.path === 'string'
    && typeof value.tenant_page.title === 'string'
    && Array.isArray(value.tenant_page.blocks)))
  && Array.isArray(value.locationReviews)
  && Array.isArray(value.globalReviews)
  && value.globalReviews.every(item => isRecord(item) && typeof item.rating === 'number')
  && (value.reviewsAggregate === null || isRecord(value.reviewsAggregate))
  && Array.isArray(value.reviewsList)
  && Array.isArray(value.media)
  && Array.isArray(value.qaList)
  && Array.isArray(value.postsList)
  && Array.isArray(value.globalPosts)
  && value.globalPosts.every(item => isRecord(item) && typeof item.id === 'string')
  && Array.isArray(value.blogList)
  && (value.blogPost === null || isRecord(value.blogPost))
  && isRecord(value.reservationPolicyByLocation)
  && Object.values(value.reservationPolicyByLocation).every(item => item === null || isRecord(item))
  && Array.isArray(value.products)
  && value.products.every(isPublicProduct)
  && Array.isArray(value.collections)
  && value.collections.every(isPublicCollection)
  && Array.isArray(value.localeRepresentations)
  && value.localeRepresentations.every(item => isRecord(item)
    && typeof item.locale === 'string'
    && typeof item.label === 'string'
    && typeof item.route_path === 'string'
    && (item.source === 'source' || item.source === 'localized'))
