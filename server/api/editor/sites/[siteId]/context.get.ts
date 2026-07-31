import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardEditorContext } from '~/server/utils/dashboard-editor-resources'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required' })
  return jsonResponse(await loadDashboardEditorContext(event, siteId))
})
