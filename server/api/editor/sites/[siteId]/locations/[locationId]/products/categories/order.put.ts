import type { ReorderProductCategoriesInput } from '~/server/types/products'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { reorderProductCategories } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readStrictBody<ReorderProductCategoriesInput>(event, { category_ids: 'unknown' })
    if (!Array.isArray(body.category_ids) || body.category_ids.some(id => typeof id !== 'string' || !id.trim())) {
      return jsonResponse({ error: 'category_ids must contain non-empty Product category IDs' }, { status: 400 })
    }
    const categories = await reorderProductCategories({
      db,
      organizationId: site.organization_id,
      siteId,
      locationId,
      categoryIds: body.category_ids.map(id => id.trim()),
      actor: session.user.id,
    })
    return jsonResponse({ success: true, categories })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_categories_reorder_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to reorder Product categories' }, { status: 500 })
  }
})
