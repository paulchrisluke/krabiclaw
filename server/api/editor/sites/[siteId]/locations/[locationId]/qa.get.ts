import { jsonResponse } from '~/server/utils/api-response'
import { listLocationQa } from '~/server/utils/location-qa'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db } = await requireLocationAccess(event, siteId, locationId)
  const qa = await listLocationQa(db, siteId, locationId)
  return jsonResponse({ qa })
})
