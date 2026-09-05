import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { listProductCategories } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)
    const categories = await listProductCategories({ db, organizationId: site.organization_id, siteId, locationId })
    return jsonResponse({ success: true, categories })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_categories_list_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load Product categories' }, { status: 500 })
  }
})
