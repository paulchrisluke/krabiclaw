import { defineHandler, HTTPError } from 'nitro'
import { cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { createStripeClient } from '~/server/utils/stripe-client'

/**
 * Stripe's hosted card form, opened straight on "Add payment method". Better
 * Auth's billing portal has no way to name this flow, so the session is made
 * here for the customer Better Auth owns; the subscription itself stays with it.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  const body = await readRequiredBody<{ organizationId?: string; flow?: string }>(event)
  if (body.flow !== 'payment_method_update') throw new HTTPError({ statusCode: 400, statusMessage: 'Unknown billing flow' })
  const organization = await resolveRequestedOrganization(event, env.DB, session.user.id, { explicitOrganizationId: typeof body.organizationId === 'string' ? body.organizationId : null })
  if (!organization) throw new HTTPError({ statusCode: 404, statusMessage: 'No organization found' })
  if (organization.role !== 'owner' && organization.role !== 'admin') throw new HTTPError({ statusCode: 403, statusMessage: 'Only owners and admins manage billing' })
  const billing = await getOrganizationBillingStatus(env, env.DB, organization.id)
  if (!billing.stripeCustomerId) throw new HTTPError({ statusCode: 409, statusMessage: 'Choose a plan before adding a payment method' })
  if (!env.STRIPE_SECRET_KEY || !env.NUXT_PUBLIC_PLATFORM_DOMAIN) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe is not configured' })
  const portal = await createStripeClient(env.STRIPE_SECRET_KEY).billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: new URL(`/dashboard/${encodeURIComponent(organization.slug)}/settings/payments`, env.NUXT_PUBLIC_PLATFORM_DOMAIN).toString(),
    flow_data: { type: 'payment_method_update' },
  })
  return jsonResponse({ url: portal.url })
})
