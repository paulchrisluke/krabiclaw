import type { RenameProductCategoryInput } from '~/server/types/products'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { renameProductCategory } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readRequiredBody<RenameProductCategoryInput>(event)
    const updated = await renameProductCategory(db, site.organization_id, siteId, locationId, body.old_category, body.new_category, session.user.id)
    return jsonResponse({ success: true, updated, old_category: body.old_category, new_category: body.new_category, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_category_rename_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to rename Product category' }, { status: 500 })
  }
})
