import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'
import { loadPublicExperienceDetail, loadPublicProductReviews } from '~/server/utils/public-products'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { getQuery } from 'nitro/h3'
import { assertExactCanonicalLocale } from '~/server/utils/localization'
import { selectProductCollectionSiblings } from '~/utils/product-seo'
import { listMetafieldDefinitions } from '~/server/utils/product-management'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Site and Experience slugs are required' }, { status: 400 })
  try {
    const db = cloudflareEnv(event).DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const locale = assertExactCanonicalLocale(getQuery(event).locale ?? 'en')
    const previewAuthorized = await resolvePreviewAuthorization(event, siteId, previewSecretOf(cloudflareEnv(event)))
    const result = await loadPublicExperienceDetail(db, siteId, previewAuthorized, slug, locale)
    if (!result) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
    const reviews = await loadPublicProductReviews(db, result)
    // The collection this Experience belongs to on this site, in the site's own
    // order. One documented rule, applied here and in the SSR path alike.
    const membership = new Set(result.product.collections.map(entry => entry.collection_id))
    const siblingCollection = result.collections.find(collection => membership.has(collection.id)) ?? null
    const priceSelection = { currency: result.currency, location_id: result.location.id, at: new Date().toISOString() }
    return jsonResponse({
      product: result.product,
      location: { id: result.location.id, slug: result.location.slug, title: result.location.title },
      currency: result.currency,
      vertical: result.site.vertical,
      brandName: result.site.brand_name,
      reviews,
      booking: result.booking,
      collectionName: siblingCollection?.name ?? '',
      collectionSiblings: siblingCollection
        ? selectProductCollectionSiblings(result.products, result.product, siblingCollection.id, priceSelection)
        : [],
      metafieldDefinitions: await listMetafieldDefinitions(db, result.site.organization_id),
      localeRepresentations: result.localeRepresentations,
    })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_experience_detail_failed', { siteId, slug, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load Experience' }, { status: 500 })
  }
})
