import { jsonResponse } from '~/server/utils/api-response'
import { deleteLocationQa } from '~/server/utils/location-qa'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const qaId = getRouterParam(event, 'qaId')
  if (!siteId || !locationId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db } = await requireLocationAccess(event, siteId, locationId)
  const result = await deleteLocationQa(db, siteId, locationId, qaId)
  return jsonResponse(result.data, { status: result.status })
})
