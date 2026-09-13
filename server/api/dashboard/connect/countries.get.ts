import { defineHandler, HTTPError } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { jsonResponse } from '~/server/utils/api-response'
import { createStripeClient } from '~/server/utils/stripe-client'
import { listStripeConnectCountries } from '~/server/utils/stripe-connect'

export default defineHandler(async (event) => {
  const { env, organization } = await getDashboardContext(event, { requireSite: false })
  assertOrganizationAccess(organization.role)
  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe Connect is not configured' })
  try {
    return jsonResponse({
      success: true,
      countries: await listStripeConnectCountries(createStripeClient(env.STRIPE_SECRET_KEY)),
    })
  } catch (error) {
    console.error('stripe_connect_countries_failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new HTTPError({ statusCode: 502, statusMessage: 'Stripe Connect countries are unavailable' })
  }
})
