import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess, requireOrganizationAccess } from '~/server/utils/location-access'
import { requireOrganizationProduct } from '~/server/utils/product-management'
import { listAvailabilityRules } from '~/server/utils/availability'
import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

/** The weekly schedule a product runs at one location: its rules, as stored. */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const productId = getRouterParam(event, 'productId')
  if (!organizationId || !productId) return jsonResponse({ error: 'Organization ID and product ID are required' }, { status: 400 })
  const rawLocation = getQuery(event).location_id
  const locationId = rawLocation === 'online' ? null : rawLocation
  if (locationId !== null && (typeof locationId !== 'string' || !locationId)) return jsonResponse({ error: 'location_id is required' }, { status: 400 })
  try {
    const { db, organization } = await (locationId === null ? requireOrganizationAccess(event, organizationId) : requireLocationAccess(event, organizationId, locationId))
    // A product id in the path is not authorized by the site in the path.
    await requireOrganizationProduct(db, { organizationId: organization.id, productId })
    const rules = (await listAvailabilityRules(db, organization.id, productId)).filter(rule => rule.location_id === locationId)
    return jsonResponse({ success: true, rules })
  } catch (error) {
    rethrowHttpError(error)
    console.error('availability_list_failed', { organizationId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load the schedule' }, { status: 500 })
  }
})
