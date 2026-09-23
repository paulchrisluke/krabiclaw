import { jsonResponse } from '~/server/utils/api-response'
import { deleteLocationQa } from '~/server/utils/location-qa'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locationId = getRouterParam(event, 'locationId')
  const qaId = getRouterParam(event, 'qaId')
  if (!organizationId || !locationId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db } = await requireLocationAccess(event, organizationId, locationId)
  const result = await deleteLocationQa(db, organizationId, locationId, qaId)
  return jsonResponse(result.data, { status: result.status })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
