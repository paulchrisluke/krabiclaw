import type { Product } from '~/server/types/products'
import type { PublicProductReview } from '~/server/utils/public-products'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
import type { ProductCategorySibling } from '~/utils/product-seo'
import { isPublicProduct, type PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

export interface PublicProductDetailPayload {
  product: Product
  location: { id: string; slug: string; title: string }
  currency: CurrencyCode
  vertical: string
  brandName: string
  reviews: PublicProductReview[]
  /** Other priced items in this product's own category at this location. */
  categorySiblings: ProductCategorySibling[]
  localeRepresentations: PublicLocaleRepresentation[]
}

function isPublicProductDetailPayload(value: unknown): value is PublicProductDetailPayload {
  return isRecord(value)
    && isPublicProduct(value.product)
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
    && Array.isArray(value.categorySiblings)
    && value.categorySiblings.every(sibling => isRecord(sibling)
      && typeof sibling.id === 'string'
      && typeof sibling.name === 'string'
      && typeof sibling.slug === 'string')
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
        const [{ cloudflareEnv }, { loadPublicProductDetail, loadPublicProductReviews }, { selectProductCategorySiblings }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/public-products'),
          import('~/utils/product-seo'),
        ])
        const db = cloudflareEnv(requestEvent).DB
        if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
        const detail = await loadPublicProductDetail(db, siteId, routeKind, Boolean(requestEvent.context.previewAuthorized), locationSlug, productSlug, locale)
        if (!detail) return null
        return {
          product: detail.product,
          location: { id: detail.location.id, slug: detail.location.slug, title: detail.location.title },
          currency: detail.currency,
          vertical: detail.site.vertical,
          brandName: detail.site.brand_name,
          reviews: locale === 'en' ? await loadPublicProductReviews(db, detail) : [],
          categorySiblings: selectProductCategorySiblings(detail.products, detail.product),
          localeRepresentations: detail.localeRepresentations,
        }
      }
      return publicApiRequest(`/api/public/sites/${encodeURIComponent(siteId)}/locations/${encodeURIComponent(locationSlug)}/products/${encodeURIComponent(productSlug)}?locale=${encodeURIComponent(locale)}`, {
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
