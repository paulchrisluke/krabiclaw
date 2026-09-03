import { jsonResponse } from '~/server/utils/api-response'
import { listServicePoints } from '~/server/domain/service-points'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const servicePoints = await listServicePoints(db, {
    organizationId: site.organization_id,
    siteId,
    locationId,
  })
  return jsonResponse({ service_points: servicePoints })
})
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
