import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'
import { loadPublicExperienceDetail, loadPublicProductReviews, loadPublicProductSessions } from '~/server/utils/public-products'
import { publicLocationPayload } from '~/server/utils/public-products'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { getQuery } from 'nitro/h3'
import { assertExactCanonicalLocale } from '~/server/utils/localization'
import { selectProductCollectionSiblings } from '~/utils/product-seo'
import { listMetafieldDefinitions } from '~/server/utils/product-management'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  const slug = getRouterParam(event, 'slug')
  if (!organizationId || !slug) return jsonResponse({ error: 'Site and Experience slugs are required' }, { status: 400 })
  try {
    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const locale = assertExactCanonicalLocale(getQuery(event).locale ?? 'en')
    const previewAuthorized = await resolvePreviewAuthorization(event, organizationId, previewSecretOf(cloudflareEnv(event)))
    const result = await loadPublicExperienceDetail(env, db, organizationId, previewAuthorized, slug, locale)
    if (!result) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
    const reviews = await loadPublicProductReviews(db, result)
    // The collection this Experience belongs to on this site, in the site's own
    // order. One documented rule, applied here and in the SSR path alike.
    const membership = new Set(result.product.collections.map(entry => entry.collection_id))
    const siblingCollection = result.collections.find(collection => membership.has(collection.id)) ?? null
    const priceSelection = { currency: result.currency, location_id: result.location.id, at: new Date().toISOString() }
    return jsonResponse({
      product: result.product,
      location: publicLocationPayload(result.location),
      currency: result.currency,
      vertical: result.site.vertical,
      brandName: result.site.name,
      reviews,
      booking: result.booking,
      sessions: await loadPublicProductSessions(db, result),
      collectionName: siblingCollection?.name ?? '',
      collectionSiblings: siblingCollection
        ? selectProductCollectionSiblings(result.products, result.product, siblingCollection.id, priceSelection)
        : [],
      metafieldDefinitions: await listMetafieldDefinitions(db, result.site.id),
      localeRepresentations: result.localeRepresentations,
    })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_experience_detail_failed', { organizationId, slug, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load Experience' }, { status: 500 })
  }
})
