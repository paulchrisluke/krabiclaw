import { defineHandler, HTTPError } from 'nitro'
import { sendRedirect } from 'nitro/h3'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { createStripeClient } from '~/server/utils/stripe-client'
import {
  buildStripeConnectOnboardingUrls,
  createStripeConnectOnboardingLink,
  getStripeConnectedAccount,
} from '~/server/utils/stripe-connect'

export default defineHandler(async (event) => {
  const { env, db, organization } = await getDashboardContext(event, { requireSite: false })
  assertOrganizationAccess(organization.role)
  if (!env.STRIPE_SECRET_KEY || !env.NUXT_PUBLIC_PLATFORM_DOMAIN) {
    throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe Connect is not configured' })
  }
  const account = await getStripeConnectedAccount(db, organization.id)
  if (!account?.stripeAccountId) throw new HTTPError({ statusCode: 409, statusMessage: 'Stripe onboarding has not started' })
  const onboardingUrl = await createStripeConnectOnboardingLink(
    createStripeClient(env.STRIPE_SECRET_KEY),
    { stripeAccountId: account.stripeAccountId, ...buildStripeConnectOnboardingUrls(env.NUXT_PUBLIC_PLATFORM_DOMAIN, organization.slug) },
  )
  return sendRedirect(event, onboardingUrl, 303)
})
