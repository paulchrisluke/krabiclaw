import { apiErrorResponse, cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getRequestDataMetrics } from '../../utils/request-metrics'
import { BillingPlansError, getCachedPlans, type Plan, type PlanPrice, type PlanLimits, type EnvWithSiteCache } from '../../utils/billing-plans'

// Re-export types so existing imports from this route path continue to work.
export type { Plan, PlanPrice, PlanLimits }
export { getCachedPlans }

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  if (!env.STRIPE_SECRET_KEY) {
    return apiErrorResponse(event, 503, 'BILLING_NOT_CONFIGURED', 'Billing provider is not configured')
  }

  setHeader(event, 'Cache-Control', 'public, max-age=3600')

  try {
    const plans = await getCachedPlans(env as EnvWithSiteCache)
    return jsonResponse(plans)
  } catch (error) {
    const planError = error instanceof BillingPlansError
      ? error
      : new BillingPlansError('BILLING_PLANS_UNAVAILABLE', 'Billing plans are temporarily unavailable', error)
    const requestId = getRequestDataMetrics(event).requestId
    const message = planError.message
    setHeader(event, 'x-request-id', requestId)
    throw createError({
      statusCode: planError.statusCode,
      statusMessage: message,
      data: {
        error: {
          code: planError.code,
          message,
          requestId,
        },
      },
      cause: planError,
    })
  }
})
import { defineEventHandler } from 'h3'
import { setHeader } from 'h3'
