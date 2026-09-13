import type { Product, ProductSurface } from '~/server/types/products'
import type { PublicProductBooking, PublicProductLocationPayload, PublicProductReview } from '~/server/utils/public-products'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
import type { ProductCollectionSibling } from '~/utils/product-seo'
import type { MetafieldDefinition } from '~/shared/metafields'
import { isPublicProduct, type PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

export interface PublicProductDetailPayload {
  product: Product
  location: PublicProductLocationPayload
  currency: CurrencyCode
  vertical: string
  brandName: string
  reviews: PublicProductReview[]
  /** Non-null exactly when this Product takes bookings. */
  booking: PublicProductBooking | null
  /** The collection this page was reached through, and its other members. */
  collectionName: string
  collectionSiblings: ProductCollectionSibling[]
  /** The tenant's attribute vocabulary, so the page can label its own facts. */
  metafieldDefinitions: MetafieldDefinition[]
  localeRepresentations: PublicLocaleRepresentation[]
}

function isPublicProductDetailPayload(value: unknown): value is PublicProductDetailPayload {
  return isRecord(value)
    && isPublicProduct(value.product)
    && isRecord(value.location)
    && typeof value.location.id === 'string'
    && typeof value.location.slug === 'string'
    && typeof value.location.title === 'string'
    && (value.location.address === null || typeof value.location.address === 'string')
    && (value.location.phone === null || typeof value.location.phone === 'string')
    && (value.location.maps_url === null || typeof value.location.maps_url === 'string')
    && (value.location.latitude === null || typeof value.location.latitude === 'number')
    && (value.location.longitude === null || typeof value.location.longitude === 'number')
    && isCurrencyCode(value.currency)
    && typeof value.vertical === 'string'
    && typeof value.brandName === 'string'
    && value.brandName.trim().length > 0
    && (value.booking === null || (isRecord(value.booking)
      && (value.booking.duration_minutes === null || typeof value.booking.duration_minutes === 'number')
      && (value.booking.default_capacity === null || typeof value.booking.default_capacity === 'number')))
    && Array.isArray(value.reviews)
    && value.reviews.every(review => isRecord(review)
      && typeof review.id === 'string'
      && typeof review.author === 'string'
      && typeof review.rating === 'number'
      && (typeof review.title === 'string' || review.title === null)
      && typeof review.content === 'string'
      && typeof review.createdAt === 'string')
    && typeof value.collectionName === 'string'
    && Array.isArray(value.collectionSiblings)
    && value.collectionSiblings.every(sibling => isRecord(sibling)
      && typeof sibling.id === 'string'
      && typeof sibling.name === 'string'
      && typeof sibling.slug === 'string')
    && Array.isArray(value.metafieldDefinitions)
    && value.metafieldDefinitions.every(definition => isRecord(definition)
      && typeof definition.id === 'string'
      && typeof definition.namespace === 'string'
      && typeof definition.key === 'string'
      && typeof definition.name === 'string')
    && Array.isArray(value.localeRepresentations)
    && value.localeRepresentations.every(item => isRecord(item)
      && typeof item.locale === 'string'
      && typeof item.label === 'string'
      && typeof item.route_path === 'string'
      && (item.source === 'source' || item.source === 'localized'))
}

export async function usePublicProductDetail(routeKind: ProductSurface) {
  const route = useRoute()
  const requestEvent = useRequestEvent()
  const { siteId } = useTenantSite()
  // An Experience's page is site-wide: /experiences/<product-slug> names the
  // Product in its only slug segment, where a vertical's product page names the
  // branch first. Same payload either way, so one composable serves both.
  const routeSlug = String(route.params.slug ?? '')
  const productSlugParam = String(route.params.productSlug ?? '')
  const siteWideExperience = routeKind === 'experiences' && productSlugParam === ''
  const locationSlug = siteWideExperience ? '' : routeSlug
  const productSlug = siteWideExperience ? routeSlug : productSlugParam
  const locale = typeof route.params.locale === 'string' ? route.params.locale : 'en'
  const localeRepresentations = useState<PublicLocaleRepresentation[]>('public-locale-representations', () => [])
  if (!siteId || !productSlug || (!siteWideExperience && !locationSlug)) throw createError({ statusCode: 404, statusMessage: 'Product not found' })

  const { data, error } = await useAsyncData<PublicProductDetailPayload | null>(
    `public-product-${siteId}-${locale}-${locationSlug}-${productSlug}`,
    async (_nuxtApp, { signal }) => {
      if (import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { loadPublicExperienceDetail, loadPublicProductDetail, loadPublicProductReviews, publicLocationPayload }, { selectProductCollectionSiblings }, { listMetafieldDefinitions }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/public-products'),
          import('~/utils/product-seo'),
          import('~/server/utils/product-management'),
        ])
        const db = cloudflareEnv(requestEvent).DB
        if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
        const previewAuthorized = Boolean(requestEvent.context.previewAuthorized)
        const detail = siteWideExperience
          ? await loadPublicExperienceDetail(db, siteId, previewAuthorized, productSlug, locale)
          : await loadPublicProductDetail(db, siteId, routeKind, previewAuthorized, locationSlug, productSlug, locale)
        if (!detail) return null
        // The collection this product belongs to on this site, in the site's
        // own order. Several means the first by that order — one documented
        // rule, not a per-caller guess.
        const membership = new Set(detail.product.collections.map(entry => entry.collection_id))
        const siblingCollection = detail.collections.find(collection => membership.has(collection.id)) ?? null
        return {
          product: detail.product,
          location: publicLocationPayload(detail.location),
          currency: detail.currency,
          vertical: detail.site.vertical,
          brandName: detail.site.brand_name,
          reviews: locale === 'en' ? await loadPublicProductReviews(db, detail) : [],
          booking: detail.booking,
          // Siblings come from the collection this product actually belongs
          // to on this site. With none, there are no siblings to show — the
          // page does not fall back to "everything at this location".
          collectionName: siblingCollection?.name ?? '',
          collectionSiblings: siblingCollection
            ? selectProductCollectionSiblings(detail.products, detail.product, siblingCollection.id, {
                currency: detail.currency, location_id: detail.location.id, at: new Date().toISOString(),
              })
            : [],
          metafieldDefinitions: await listMetafieldDefinitions(db, detail.site.organization_id),
          localeRepresentations: detail.localeRepresentations,
        }
      }
      const path = siteWideExperience
        ? `/api/public/sites/${encodeURIComponent(siteId)}/experiences/${encodeURIComponent(productSlug)}`
        : `/api/public/sites/${encodeURIComponent(siteId)}/locations/${encodeURIComponent(locationSlug)}/products/${encodeURIComponent(productSlug)}`
      return publicApiRequest(`${path}?locale=${encodeURIComponent(locale)}`, {
        signal,
        coalesceKey: `public-product-${siteId}-${locale}-${locationSlug}-${productSlug}`,
        validate: isPublicProductDetailPayload,
      })
    },
    { server: true, lazy: false },
  )
  if (error.value) throw error.value
  if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  localeRepresentations.value = data.value.localeRepresentations
  return { siteId, detail: data as Ref<PublicProductDetailPayload> }
}
