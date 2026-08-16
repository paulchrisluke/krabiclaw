import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardLocationQa } from '~/server/utils/dashboard-editor-resources'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  return jsonResponse(await loadDashboardLocationQa(event, siteId, locationId))
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
