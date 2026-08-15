import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardContext } from '~/server/utils/dashboard-context-service'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler(async (event) => {
  // afterTransfer: opt-in for the post-transfer onboarding page, which has no
  // siteSlug route segment to attach a header from and needs to resolve the
  // specific site this user just received — see resolveRecentlyTransferredSite.
  const afterTransfer = getQuery(event).afterTransfer === 'true'
  const payload = await loadDashboardContext(event, { afterTransfer })
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-context', payload))
})
import { defineEventHandler } from 'h3'
import { getQuery } from 'h3'
