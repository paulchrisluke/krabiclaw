import type { ReorderProductsInput } from '~/server/types/products'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { reorderProducts } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Commits one complete intended order for a category. The CMS reorder mode
 * keeps its rearrangement local and sends the finished order once, so a session
 * of moves costs a single request instead of one per step.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readStrictBody<ReorderProductsInput>(event, {
      category_id: 'string',
      product_ids: 'unknown',
    })
    if (typeof body.category_id !== 'string' || !body.category_id.trim()) {
      return jsonResponse({ error: 'category_id must be a non-empty Product category ID' }, { status: 400 })
    }
    if (!Array.isArray(body.product_ids) || body.product_ids.some(id => typeof id !== 'string' || !id.trim())) {
      return jsonResponse({ error: 'product_ids must contain non-empty Product IDs' }, { status: 400 })
    }
    await reorderProducts({
      db,
      organizationId: site.organization_id,
      siteId,
      locationId,
      categoryId: body.category_id.trim(),
      productIds: body.product_ids.map(id => id.trim()),
      actor: session.user.id,
    })
    return jsonResponse({ success: true, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_reorder_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to reorder Products' }, { status: 500 })
  }
})
