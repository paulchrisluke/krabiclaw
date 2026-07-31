import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardGuestThread } from '~/server/utils/dashboard-guest-threads'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  if (!siteId || !threadId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const payload = await loadDashboardGuestThread(event, siteId, threadId)
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-guest-thread', payload))
})
