import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getCachedPlans, type Plan, type PlanPrice, type PlanLimits, type EnvWithSiteCache } from '../../utils/billing-plans'

// Re-export types so existing imports from this route path continue to work.
export type { Plan, PlanPrice, PlanLimits }
export { getCachedPlans }

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  if (!env.STRIPE_SECRET_KEY) {
    throw createError({ statusCode: 503, message: 'Billing not configured' })
  }

  setHeader(
    event,
    'Cache-Control',
    'public, max-age=3600, stale-while-revalidate=86400',
  )

  const plans = await getCachedPlans(
    env as EnvWithSiteCache,
  )
  return jsonResponse(plans)
})
