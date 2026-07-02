// Prefetches Stripe plan pricing for the platform homepage on the real
// inbound request (which has full Cloudflare bindings) and stashes it on
// event.context. usePlans.ts reads this directly during SSR instead of
// self-fetching /api/billing/plans — a self-fetch event never inherits
// event.context.cloudflare, so it can't reach the KV cache in
// getCachedPlans() and would otherwise call Stripe live on every render.
// Runs after tenant-resolution.ts (needs event.context.tenantType) — name
// sorts into the zz- group alongside the other post-tenant-resolution
// middleware for the same reason.
import { defineEventHandler, getRequestURL } from 'h3'
import { cloudflareEnv, isInternalSelfFetch } from '~/server/utils/api-response'
import { getCachedPlans, type EnvWithSiteCache } from '~/server/utils/billing-plans'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return
  if (isInternalSelfFetch(event)) return
  if (event.context.tenantType !== TENANT_TYPES.PLATFORM) return

  const url = getRequestURL(event)
  if (url.pathname !== '/') return

  const env = cloudflareEnv(event)
  if (!env.STRIPE_SECRET_KEY) return

  try {
    event.context.platformPlans = await getCachedPlans(
      env as EnvWithSiteCache,
    )
  } catch (error) {
    // Non-fatal — usePlans.ts falls back to a self-fetch (uncached, but
    // functionally correct) if event.context.platformPlans is unset.
    console.error('[plans-prefetch] failed to prefetch plans:', error)
  }
})
