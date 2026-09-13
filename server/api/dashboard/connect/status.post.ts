import { defineHandler, HTTPError } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { jsonResponse } from '~/server/utils/api-response'
import { createStripeClient } from '~/server/utils/stripe-client'
import { getStripeConnectedAccount, refreshStripeConnectedAccount } from '~/server/utils/stripe-connect'

export default defineHandler(async (event) => {
  const { env, db, organization } = await getDashboardContext(event, { requireSite: false })
  assertOrganizationAccess(organization.role)
  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe Connect is not configured' })
  const connected = await getStripeConnectedAccount(db, organization.id)
  if (!connected?.stripeAccountId) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Stripe onboarding has not started' })
  }
  try {
    const account = await refreshStripeConnectedAccount(db, createStripeClient(env.STRIPE_SECRET_KEY), connected)
    return jsonResponse({ success: true, account })
  } catch (error) {
    console.error('stripe_connect_status_refresh_failed', {
      organizationId: organization.id,
      stripeAccountId: connected.stripeAccountId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new HTTPError({ statusCode: 502, statusMessage: 'Stripe account status could not be refreshed' })
  }
})
