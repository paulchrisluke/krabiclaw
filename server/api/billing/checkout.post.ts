import { toWebRequest } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { queryFirst } from '~/server/db'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import { isManagedServiceEnabled } from '~/server/utils/feature-flags'
import { CONCIERGE_PLAN_IDS } from '~/server/utils/better-auth-stripe'

interface CheckoutRequest {
  organizationId?: string
  siteId?: string
  plan?: string
  interval?: 'month' | 'year'
  successUrl?: string
  cancelUrl?: string
  gaClientId?: string
}

async function legacyCheckoutResponse(response: Response) {
  const payload = await response.json().catch(() => null) as { url?: unknown } | null
  if (!response.ok) {
    return jsonResponse(payload ?? { error: 'Unable to create checkout session' }, { status: response.status })
  }
  if (!payload || typeof payload.url !== 'string' || payload.url.length === 0) {
    return jsonResponse({ error: 'Better Auth did not return a checkout URL' }, { status: 502 })
  }
  return jsonResponse({ success: true, checkoutUrl: payload.url })
}

/**
 * Compatibility alias for callers that have not moved to the Better Auth
 * client yet. It performs no Stripe work; the canonical implementation is
 * /api/auth/subscription/upgrade.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<CheckoutRequest>(event)
  if (!body?.plan) return jsonResponse({ error: 'Plan is required' }, { status: 400 })
  if (!['growth', 'managed', 'seo_accelerator'].includes(body.plan)) {
    return jsonResponse({ error: 'Invalid plan' }, { status: 400 })
  }
  if (body.interval && body.interval !== 'month' && body.interval !== 'year') {
    return jsonResponse({ error: 'Invalid interval. Allowed values are month or year' }, { status: 400 })
  }

  const env = cloudflareEnv(event) as CloudflareEnv
  if (CONCIERGE_PLAN_IDS.has(body.plan) && !isManagedServiceEnabled(env)) {
    return jsonResponse({ error: 'This plan is not currently available' }, { status: 403 })
  }
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw createError({ statusCode: 503, statusMessage: 'Stripe not configured' })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const organization = await resolveRequestedOrganization(event, env.DB, session.user.id, {
    explicitOrganizationId: body.organizationId ?? null,
  })
  if (!organization) throw createError({ statusCode: 404, statusMessage: 'No organization found' })
  if (!body.siteId) throw createError({ statusCode: 400, statusMessage: 'siteId is required' })
  const site = await queryFirst<{ id: string }>(env.DB, `
    SELECT id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [body.siteId, organization.id])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found or does not belong to this organization' })

  const request = toWebRequest(event)
  const target = new URL(request.url)
  target.pathname = '/api/auth/subscription/upgrade'
  target.search = ''
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  const baseUrl = getRequestURL(event).origin
  const billingUrl = new URL(`${baseUrl}/dashboard/${encodeURIComponent(organization.slug)}/settings/billing`)
  const successUrl = new URL(billingUrl)
  successUrl.searchParams.set('success', 'true')
  const canceledUrl = new URL(billingUrl)
  canceledUrl.searchParams.set('canceled', 'true')
  const callbackUrl = body.successUrl ?? successUrl.toString()
  const cancelUrl = body.cancelUrl ?? canceledUrl.toString()
  const billingStatus = await getOrganizationBillingStatus(env, env.DB, organization.id)

  if (billingStatus.subscriptionStatus === 'past_due') {
    target.pathname = '/api/auth/subscription/billing-portal'
    return await createAuth(env).handler(new Request(target, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        referenceId: organization.id,
        customerType: 'organization',
        returnUrl: billingUrl.toString(),
        disableRedirect: true,
      }),
    })).then(legacyCheckoutResponse)
  }

  return await createAuth(env).handler(new Request(target, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      plan: body.plan,
      annual: body.interval === 'year',
      referenceId: organization.id,
      ...(billingStatus.stripeSubscriptionId ? { subscriptionId: billingStatus.stripeSubscriptionId } : {}),
      customerType: 'organization',
      metadata: {
        site_id: body.siteId,
        ...(body.gaClientId ? { ga_client_id: body.gaClientId } : {}),
      },
      successUrl: callbackUrl,
      cancelUrl,
      returnUrl: billingUrl.toString(),
      disableRedirect: true,
    }),
  })).then(legacyCheckoutResponse)
})
