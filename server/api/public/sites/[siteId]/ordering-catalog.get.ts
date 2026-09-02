import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { loadPublicOrderingCatalog } from '~/server/utils/public-products'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const db = cloudflareEnv(event).DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const catalog = await loadPublicOrderingCatalog(db, siteId)
    if (!catalog) return jsonResponse({ error: 'Ordering catalog not found' }, { status: 404 })
    return jsonResponse({
      products: catalog.products,
      locations: catalog.locations.map(({ id, slug, title }) => ({ id, slug, title })),
      currency: catalog.currency,
    })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_ordering_catalog_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load the ordering catalog' }, { status: 500 })
  }
})
