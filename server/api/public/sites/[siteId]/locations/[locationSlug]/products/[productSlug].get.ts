import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { loadPublicProductApiDetail, loadPublicProductReviews } from '~/server/utils/public-products'
import { defineHandler } from 'nitro'
import { getRouterParam, getQuery } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationSlug = getRouterParam(event, 'locationSlug')
  const productSlug = getRouterParam(event, 'productSlug')
  if (!siteId || !locationSlug || !productSlug) return jsonResponse({ error: 'Site, location, and Product slugs are required' }, { status: 400 })
  try {
    const db = cloudflareEnv(event).DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const query = getQuery(event)
    const locale = typeof query.locale === 'string' ? query.locale : null
    const result = await loadPublicProductApiDetail(db, siteId, locationSlug, productSlug, locale)
    if (!result) return jsonResponse({ error: 'Product not found' }, { status: 404 })
    const reviews = await loadPublicProductReviews(db, result)
    return jsonResponse({
      product: result.product,
      location: { id: result.location.id, slug: result.location.slug, title: result.location.title },
      currency: result.currency,
      vertical: result.site.vertical,
      brandName: result.site.brand_name,
      reviews,
    })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_product_detail_failed', { siteId, locationSlug, productSlug, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load Product' }, { status: 500 })
  }
})
