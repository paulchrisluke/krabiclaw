import type { MoveProductCategoryInput } from '~/server/types/products'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { moveProductCategory } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readStrictBody<MoveProductCategoryInput>(event, {
      category: 'string',
      before_category: 'nullable-string',
    })
    if (typeof body.category !== 'string' || !body.category.trim()) {
      return jsonResponse({ error: 'category must be a non-empty string' }, { status: 400 })
    }
    if (body.before_category === undefined) {
      return jsonResponse({ error: 'before_category is required and must be a category name or null' }, { status: 400 })
    }
    if (typeof body.before_category === 'string' && !body.before_category.trim()) {
      return jsonResponse({ error: 'before_category must be a non-empty category name or null' }, { status: 400 })
    }
    const beforeCategory = body.before_category === null ? null : body.before_category.trim()
    await moveProductCategory({ db, organizationId: site.organization_id, siteId, locationId, category: body.category.trim(), beforeCategory, actor: session.user.id })
    return jsonResponse({ success: true, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_category_move_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to move Product category' }, { status: 500 })
  }
})
