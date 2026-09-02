import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { deactivateMerchantHandoffDestination } from '~/server/utils/merchant-handoff'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const deactivated = await deactivateMerchantHandoffDestination(db, {
    organizationId: site.organization_id,
    siteId,
    locationId,
  })
  return jsonResponse({ deactivated })
})
