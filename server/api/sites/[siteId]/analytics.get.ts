import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardSiteAnalytics } from '~/server/utils/dashboard-site-analytics'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required' })
  const query = getQuery(event)
  return jsonResponse(await loadDashboardSiteAnalytics(event, siteId, {
    startDate: typeof query.startDate === 'string' ? query.startDate : undefined,
    endDate: typeof query.endDate === 'string' ? query.endDate : undefined,
  }))
})
import { defineEventHandler } from 'h3'
import { getQuery } from 'h3'
import { getRouterParam } from 'h3'
