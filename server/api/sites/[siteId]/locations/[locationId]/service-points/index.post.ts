import { createServicePoint } from '~/server/domain/service-points'
import { jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  const body = await readStrictBody<{ label: string }>(event, { label: 'string' })
  const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
  const servicePoint = await createServicePoint(db, {
    organizationId: site.organization_id,
    siteId,
    locationId,
  }, body, session.user.id)
  return jsonResponse({ service_point: servicePoint }, { status: 201 })
})
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
