import { updateServicePoint } from '~/server/domain/service-points'
import { jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const servicePointId = getRouterParam(event, 'servicePointId')
  if (!siteId || !locationId || !servicePointId) {
    return jsonResponse({ error: 'Site ID, location ID, and service point ID are required' }, { status: 400 })
  }

  const body = await readStrictBody<{ label?: string; status?: string }>(event, {
    label: 'string',
    status: 'string',
  })
  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const servicePoint = await updateServicePoint(db, {
    organizationId: site.organization_id,
    siteId,
    locationId,
  }, servicePointId, body)
  return jsonResponse({ service_point: servicePoint })
})
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
