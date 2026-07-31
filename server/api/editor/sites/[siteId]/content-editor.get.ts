import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardContentEditor } from '~/server/utils/dashboard-editor-resources'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const query = getQuery(event)
  const page = typeof query.page === 'string' ? query.page : ''
  if (!siteId || !page) throw createError({ statusCode: 400, statusMessage: 'Site ID and page are required' })
  return jsonResponse(await loadDashboardContentEditor(
    event,
    siteId,
    page,
    typeof query.locationId === 'string' ? query.locationId : undefined,
  ))
})
