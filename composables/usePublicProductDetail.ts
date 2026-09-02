import type { Product } from '~/server/types/products'
import type { PublicProductReview } from '~/server/utils/public-products'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { publicApiRequest } from '~/utils/api-clients'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

export interface PublicProductDetailPayload {
  product: Product
  location: { id: string; slug: string; title: string }
  currency: CurrencyCode
  vertical: string
  brandName: string
  reviews: PublicProductReview[]
  localeRepresentations: PublicLocaleRepresentation[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProduct(value: unknown): value is Product {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.site_id === 'string'
    && typeof value.location_id === 'string'
    && typeof value.category === 'string'
    && typeof value.name === 'string'
    && typeof value.slug === 'string'
    && (value.price === null || isRecord(value.price))
    && typeof value.is_visible === 'boolean'
    && typeof value.available === 'boolean'
    && Array.isArray(value.tags)
    && Array.isArray(value.details)
    && (value.image === null || isRecord(value.image))
    && Array.isArray(value.gallery)
}

function isPublicProductDetailPayload(value: unknown): value is PublicProductDetailPayload {
  return isRecord(value)
    && isProduct(value.product)
    && isRecord(value.location)
    && typeof value.location.id === 'string'
    && typeof value.location.slug === 'string'
    && typeof value.location.title === 'string'
    && isCurrencyCode(value.currency)
    && typeof value.vertical === 'string'
    && typeof value.brandName === 'string'
    && value.brandName.trim().length > 0
    && Array.isArray(value.reviews)
    && value.reviews.every(review => isRecord(review)
      && typeof review.id === 'string'
      && typeof review.author === 'string'
      && typeof review.rating === 'number'
      && typeof review.title === 'string'
      && typeof review.content === 'string'
      && typeof review.createdAt === 'string')
    && Array.isArray(value.localeRepresentations)
    && value.localeRepresentations.every(item => isRecord(item)
      && typeof item.locale === 'string'
      && typeof item.label === 'string'
      && typeof item.route_path === 'string'
      && (item.source === 'source' || item.source === 'localized'))
}

export async function usePublicProductDetail(routeKind: 'menu' | 'products') {
  const route = useRoute()
  const requestEvent = useRequestEvent()
  const { siteId } = useTenantSite()
  const locationSlug = String(route.params.slug ?? '')
  const productSlug = String(route.params.productSlug ?? '')
  const locale = typeof route.params.locale === 'string' ? route.params.locale : 'en'
  const localeRepresentations = useState<PublicLocaleRepresentation[]>('public-locale-representations', () => [])
  if (!siteId || !locationSlug || !productSlug) throw createError({ statusCode: 404, statusMessage: 'Product not found' })

  const { data, error } = await useAsyncData<PublicProductDetailPayload | null>(
    `public-product-${siteId}-${locale}-${locationSlug}-${productSlug}`,
    async (_nuxtApp, { signal }) => {
      if (import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { loadPublicProductDetail, loadPublicProductReviews }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/public-products'),
        ])
        const db = cloudflareEnv(requestEvent).DB
        if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
        const detail = await loadPublicProductDetail(db, siteId, routeKind, locationSlug, productSlug, locale)
        if (!detail) return null
        return {
          product: detail.product,
          location: { id: detail.location.id, slug: detail.location.slug, title: detail.location.title },
          currency: detail.currency,
          vertical: detail.site.vertical,
          brandName: detail.site.brand_name,
          reviews: await loadPublicProductReviews(db, detail),
          localeRepresentations: detail.localeRepresentations,
        }
      }
      return publicApiRequest(`/api/public/sites/${encodeURIComponent(siteId)}/locations/${encodeURIComponent(locationSlug)}/products/${encodeURIComponent(productSlug)}?locale=${encodeURIComponent(locale)}`, {
        signal,
        coalesceKey: `public-product-${siteId}-${locationSlug}-${productSlug}`,
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
