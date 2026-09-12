import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'
import { loadPublicProductApiDetail, loadPublicProductReviews } from '~/server/utils/public-products'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationSlug = getRouterParam(event, 'locationSlug')
  const productSlug = getRouterParam(event, 'productSlug')
  if (!siteId || !locationSlug || !productSlug) return jsonResponse({ error: 'Site, location, and Product slugs are required' }, { status: 400 })
  try {
    const db = cloudflareEnv(event).DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const previewAuthorized = await resolvePreviewAuthorization(event, siteId, previewSecretOf(cloudflareEnv(event)))
    const resolved = await loadPublicProductApiDetail(db, siteId, previewAuthorized, locationSlug, productSlug)
    if (!resolved) return jsonResponse({ error: 'Product not found' }, { status: 404 })
    const reviews = await loadPublicProductReviews(db, resolved)
    return jsonResponse({ reviews })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_product_reviews_failed', { siteId, locationSlug, productSlug, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load Product reviews' }, { status: 500 })
  }
})
