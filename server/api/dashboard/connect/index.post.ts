import { defineHandler, HTTPError } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { createStripeClient } from '~/server/utils/stripe-client'
import {
  buildStripeConnectOnboardingUrls,
  createStripeConnectOnboardingLink,
  ensureStripeConnectedAccount,
  getStripeConnectedAccount,
  normalizeStripeConnectCountry,
  stripeLivemodeFromKey,
} from '~/server/utils/stripe-connect'

export default defineHandler(async (event) => {
  const { env, db, session, organization } = await getDashboardContext(event, { requireSite: false })
  assertOrganizationAccess(organization.role)
  if (!env.STRIPE_SECRET_KEY || !env.NUXT_PUBLIC_PLATFORM_DOMAIN) {
    throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe Connect is not configured' })
  }

  const body = await readStrictBody<{ country?: unknown }>(event, { country: 'unknown' })
  const existing = await getStripeConnectedAccount(db, organization.id)
  const country = existing ? existing.country : normalizeStripeConnectCountry(body.country)
  const userEmail = session.user.email
  if (typeof userEmail !== 'string' || !userEmail) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Your account needs an email address before Stripe onboarding' })
  }

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
  try {
    const account = await ensureStripeConnectedAccount(db, stripe, {
      organizationId: organization.id,
      organizationName: organization.name,
      contactEmail: userEmail,
      country,
      livemode: stripeLivemodeFromKey(env.STRIPE_SECRET_KEY),
    })
    if (!account.stripeAccountId) throw new Error('Stripe connected account ID is missing after creation')
    const urls = buildStripeConnectOnboardingUrls(env.NUXT_PUBLIC_PLATFORM_DOMAIN, organization.slug)
    const onboardingUrl = await createStripeConnectOnboardingLink(stripe, {
      stripeAccountId: account.stripeAccountId,
      ...urls,
    })
    return jsonResponse({ success: true, account, onboardingUrl })
  } catch (error) {
    console.error('stripe_connect_onboarding_failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : String(error),
    })
    if (error instanceof HTTPError) throw error
    throw new HTTPError({ statusCode: 502, statusMessage: 'Stripe onboarding could not be started' })
  }
})
