import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardLocationQa } from '~/server/utils/dashboard-editor-resources'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  return jsonResponse(await loadDashboardLocationQa(event, siteId, locationId))
})
