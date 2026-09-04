import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { deleteProductCategory } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/** Deleting a category deletes the Products in it. The CMS confirms the count first. */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const categoryId = getRouterParam(event, 'categoryId')
  if (!siteId || !locationId || !categoryId) return jsonResponse({ error: 'Site ID, location ID, and category ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const deleted = await deleteProductCategory(db, site.organization_id, siteId, locationId, categoryId, session.user.id)
    return jsonResponse({ success: true, deleted })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_category_delete_failed', { siteId, locationId, categoryId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to delete Product category' }, { status: 500 })
  }
})
