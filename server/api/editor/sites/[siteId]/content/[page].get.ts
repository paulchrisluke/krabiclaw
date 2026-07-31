import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardEditorContent } from '~/server/utils/dashboard-editor-resources'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const page = getRouterParam(event, 'page')
  if (!siteId || !page) throw createError({ statusCode: 400, statusMessage: 'Site ID and page are required' })
  const locationId = getQuery(event).locationId
  return jsonResponse(await loadDashboardEditorContent(
    event,
    siteId,
    page,
    typeof locationId === 'string' ? locationId : undefined,
  ))
})
