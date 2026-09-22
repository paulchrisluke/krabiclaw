import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'
import { loadPublicProductApiCollection } from '~/server/utils/public-products'
import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  const rawLocation = getQuery(event).location
  const location = typeof rawLocation === 'string' && rawLocation.trim() ? rawLocation.trim() : null
  try {
    const db = cloudflareEnv(event).DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const previewAuthorized = await resolvePreviewAuthorization(event, siteId, previewSecretOf(cloudflareEnv(event)))
    const result = await loadPublicProductApiCollection(db, siteId, previewAuthorized, location)
    if (!result) return jsonResponse({ error: 'Products not found' }, { status: 404 })
    return jsonResponse({
      products: result.products,
      locations: result.locations.map(({ id, slug, title }) => ({ id, slug, title })),
      currency: result.currency,
    })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_product_list_failed', { siteId, location, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load Products' }, { status: 500 })
  }
})
