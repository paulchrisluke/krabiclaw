import type { RenameProductCategoryInput } from '~/server/types/products'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { renameProductCategory } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const categoryId = getRouterParam(event, 'categoryId')
  if (!siteId || !locationId || !categoryId) return jsonResponse({ error: 'Site ID, location ID, and category ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readStrictBody<RenameProductCategoryInput>(event, { name: 'string' })
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return jsonResponse({ error: 'name must be a non-empty Product category name' }, { status: 400 })
    }
    const category = await renameProductCategory(db, site.organization_id, siteId, locationId, categoryId, body.name.trim(), session.user.id)
    return jsonResponse({ success: true, category })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_category_rename_failed', { siteId, locationId, categoryId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to rename Product category' }, { status: 500 })
  }
})
