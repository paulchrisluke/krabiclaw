import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardSiteLocales } from '~/server/utils/dashboard-editor-resources'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  return jsonResponse(await loadDashboardSiteLocales(event, siteId))
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
