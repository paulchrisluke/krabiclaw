import type { MoveProductsInput } from '~/server/types/products'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { moveProductsToCategory } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readStrictBody<MoveProductsInput>(event, {
      product_ids: 'unknown',
      category_id: 'string',
    })
    if (!Array.isArray(body.product_ids) || body.product_ids.some(id => typeof id !== 'string' || !id.trim())) {
      return jsonResponse({ error: 'product_ids must contain non-empty Product IDs' }, { status: 400 })
    }
    if (typeof body.category_id !== 'string' || !body.category_id.trim()) {
      return jsonResponse({ error: 'category_id must be a non-empty Product category ID' }, { status: 400 })
    }
    await moveProductsToCategory({
      db,
      organizationId: site.organization_id,
      siteId,
      locationId,
      productIds: body.product_ids.map(id => id.trim()),
      categoryId: body.category_id.trim(),
      actor: session.user.id,
    })
    return jsonResponse({ success: true, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_move_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to move Products' }, { status: 500 })
  }
})
