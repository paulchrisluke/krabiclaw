import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardOnboardingContext } from '~/server/utils/onboarding-context'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler(async (event) => {
  const payload = await loadDashboardOnboardingContext(event)
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-onboarding-context', payload))
})
