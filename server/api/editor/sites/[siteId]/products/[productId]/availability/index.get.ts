import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { requireSiteProduct } from '~/server/utils/product-management'
import { listAvailabilityRules } from '~/server/utils/availability'
import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

/** The weekly schedule a product runs at one location: its rules, as stored. */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  const locationId = getQuery(event).location_id
  if (typeof locationId !== 'string' || !locationId) return jsonResponse({ error: 'location_id is required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    // A product id in the path is not authorized by the site in the path.
    await requireSiteProduct(db, { organizationId: site.organization_id, siteId, productId })
    const rules = (await listAvailabilityRules(db, site.organization_id, productId)).filter(rule => rule.location_id === locationId)
    return jsonResponse({ success: true, rules })
  } catch (error) {
    rethrowHttpError(error)
    console.error('availability_list_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load the schedule' }, { status: 500 })
  }
})
