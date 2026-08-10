import Stripe from 'stripe'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { devLoginUrl } from './test-env'
import {
  assertStripeTestCanaryConfig,
  buildStripeCanaryEvidence,
  readReadiness,
  writeStripeCanaryEvidence,
  type BillingReadiness,
  type BillingState,
  type StripeTestCanaryConfig,
} from './helpers/stripe-testmode-canary'

const NON_3DS_TEST_CARD = {
  number: '4242 4242 4242 4242',
  expiry: '12/34',
  cvc: '123',
}

async function firstVisible(page: Page, selectors: string[], labels: string[] = []): Promise<Locator> {
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first()
      if (await locator.count() && await locator.isVisible().catch(() => false)) return locator
    }
    for (const label of labels) {
      const locator = frame.getByLabel(label, { exact: false }).first()
      if (await locator.count() && await locator.isVisible().catch(() => false)) return locator
    }
  }
  throw new Error(`Stripe Checkout field not found: ${selectors.join(', ') || labels.join(', ')}`)
}

async function fillHostedCheckout(page: Page, email: string): Promise<void> {
  // Stripe's hosted Checkout uses these stable autocomplete/name attributes;
  // label fallbacks cover localized test-mode pages without depending on text.
  await (await firstVisible(page, ['input[name="email"]', 'input[autocomplete="email"]'], ['Email'])).fill(email)
  await (await firstVisible(page, ['input[name="cardNumber"]', 'input[autocomplete="cc-number"]'], ['Card number'])).fill(NON_3DS_TEST_CARD.number)
  await (await firstVisible(page, ['input[name="cardExpiry"]', 'input[autocomplete="cc-exp"]'], ['Expiration date', 'Expiry'])).fill(NON_3DS_TEST_CARD.expiry)
  await (await firstVisible(page, ['input[name="cardCvc"]', 'input[autocomplete="cc-csc"]'], ['CVC', 'Security code'])).fill(NON_3DS_TEST_CARD.cvc)

  for (const frame of page.frames()) {
    const submit = frame.getByRole('button', { name: /subscribe|pay|complete|start/i }).last()
    if (await submit.count() && await submit.isVisible().catch(() => false)) {
      await submit.click()
      return
    }
  }
  throw new Error('Stripe Checkout submit button not found')
}

async function readBillingState(page: Page, baseURL: string, organizationId: string, config: StripeTestCanaryConfig): Promise<BillingState> {
  const response = await page.request.get(`${baseURL}/api/dev/billing-state?organization_id=${encodeURIComponent(organizationId)}&include_better_auth=1`, {
    headers: {
      'x-dev-route-secret': config.devRouteSecret!,
      'x-stripe-test-canary': '1',
    },
  })
  expect(response.status()).toBe(200)
  return await response.json() as BillingState
}

function providerCustomerId(value: Stripe.Customer | Stripe.DeletedCustomer | string | null | undefined): string | null {
  if (typeof value === 'string') return value
  if (value && !('deleted' in value)) return value.id
  return null
}

async function findCanaryCheckoutSession(stripe: Stripe, subscriptionId: string): Promise<Stripe.Checkout.Session> {
  const sessions = await stripe.checkout.sessions.list({ subscription: subscriptionId, status: 'complete', limit: 10 })
  const session = sessions.data.find(candidate => candidate.mode === 'subscription')
  if (!session) throw new Error('Stripe test canary did not find a completed subscription Checkout Session')
  return session
}

async function cleanupStripeResources(
  stripe: Stripe,
  organizationId: string | null,
  startedAt: number,
  subscriptionId: string | null,
  customerId: string | null,
): Promise<void> {
  if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId)

  let resolvedCustomerId = customerId
  if (!resolvedCustomerId && organizationId) {
    const customers = await stripe.customers.search({
      query: `metadata["organizationId"]:"${organizationId}" AND metadata["customerType"]:"organization"`,
      limit: 10,
    })
    resolvedCustomerId = customers.data.find(customer => customer.created >= startedAt)?.id ?? null
  }
  if (resolvedCustomerId && !subscriptionId) {
    const subscriptions = await stripe.subscriptions.list({ customer: resolvedCustomerId, status: 'all', limit: 10 })
    for (const subscription of subscriptions.data) {
      if (subscription.created < startedAt || ['canceled', 'incomplete_expired'].includes(subscription.status)) continue
      await stripe.subscriptions.cancel(subscription.id)
    }
  }
  if (resolvedCustomerId) await stripe.customers.del(resolvedCustomerId)
}

test.describe('Stripe test-mode organization checkout canary', () => {
  // This file is never part of the pre-promotion override suite.  The full
  // lane has no RUN_STRIPE_TEST_CANARY value; the post-promotion step opts in.
  test.skip(process.env.RUN_STRIPE_TEST_CANARY !== '1', 'post-promotion Stripe canary is opt-in')
  test.describe.configure({ mode: 'serial' })

  test('owner completes hosted Checkout and every billing projection converges', async ({ page, baseURL }) => {
    test.setTimeout(300_000)
    const config = assertStripeTestCanaryConfig()
    if (!config.enabled || !baseURL) throw new Error('Stripe test-mode canary is not configured')

    const stripe = new Stripe(config.secretKey!, {
      apiVersion: '2026-04-22.dahlia',
      maxNetworkRetries: 0,
      timeout: 10_000,
    })
    const startedAt = Math.floor(Date.now() / 1000)
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const userId = `e2e-stripe-canary-${suffix}`
    const canaryEmail = `${userId}@playwright.example`
    let organizationId: string | null = null
    let subscriptionId: string | null = null
    let customerId: string | null = null
    let cleanupFailed = false

    try {
      const login = await page.goto(devLoginUrl(baseURL, userId), {
        headers: { 'x-dev-route-secret': config.devRouteSecret! },
        waitUntil: 'domcontentloaded',
      })
      expect(login?.status()).toBeLessThan(400)
      await expect(page).toHaveURL(/\/dashboard/)

      const createCanarySite = async (index: number) => {
        const createSite = await page.request.post(`${baseURL}/api/sites`, {
          data: {
            name: `Stripe Test Canary ${suffix} ${index}`,
            subdomain: `e2e-stripe-canary-${suffix}-${index}`,
            vertical: 'restaurant',
          },
        })
        expect(createSite.status()).toBe(200)
        const created = await createSite.json() as { siteId?: string; organizationId?: string; subdomain?: string }
        expect(created.siteId).toEqual(expect.any(String))
        expect(created.subdomain).toContain('e2e-')
        expect(created.organizationId).toEqual(expect.any(String))
        return created as { siteId: string; organizationId: string; subdomain: string }
      }

      const firstSite = await createCanarySite(1)
      organizationId = firstSite.organizationId
      expect(organizationId).toEqual(expect.any(String))
      const secondSite = await createCanarySite(2)
      expect(secondSite.organizationId).toBe(organizationId)
      expect(secondSite.siteId).not.toBe(firstSite.siteId)
      const createdSiteIds = [firstSite.siteId, secondSite.siteId]

      const contextResponse = await page.request.get(`${baseURL}/api/dashboard/context`)
      expect(contextResponse.status()).toBe(200)
      const context = await contextResponse.json() as { organization?: { id?: string; slug?: string } }
      expect(context.organization?.id).toBe(organizationId)
      const organizationSlug = context.organization?.slug
      expect(organizationSlug).toEqual(expect.any(String))

      const returnUrl = `${baseURL}/dashboard/${encodeURIComponent(organizationSlug!)}/settings/billing`
      const checkoutResponse = await page.request.post(`${baseURL}/api/auth/subscription/upgrade`, {
        data: {
          plan: 'growth',
          annual: false,
          referenceId: organizationId,
          customerType: 'organization',
          metadata: { e2e_canary: 'issue-554-stripe-testmode' },
          successUrl: `${returnUrl}?success=true`,
          cancelUrl: `${returnUrl}?canceled=true`,
          returnUrl,
          disableRedirect: true,
        },
      })
      expect(checkoutResponse.status()).toBe(200)
      const checkoutBody = await checkoutResponse.json() as { url?: string; redirect?: boolean }
      expect(checkoutBody.redirect).toBe(false)
      expect(checkoutBody.url).toMatch(/^https:\/\/checkout\.stripe\.com\//)

      await page.goto(checkoutBody.url!, { waitUntil: 'domcontentloaded' })
      await fillHostedCheckout(page, canaryEmail)
      await page.waitForURL(url => {
        try {
          const returned = new URL(url)
          return returned.origin === new URL(baseURL).origin
            && returned.pathname.includes('/settings/billing')
            && returned.searchParams.get('success') === 'true'
        } catch {
          return false
        }
      }, { timeout: 120_000 })

      let finalState: BillingState | null = null
      let finalReadiness: BillingReadiness | null = null
      await expect.poll(async () => {
        finalState = await readBillingState(page, baseURL, organizationId!, config)
        finalReadiness = readReadiness(finalState, createdSiteIds)
        return finalReadiness
      }, {
        timeout: 180_000,
        intervals: [1_000, 2_000, 5_000, 10_000],
      }).toMatchObject({
        ready: true,
        plan: 'growth',
        billingStatus: expect.stringMatching(/active|trialing/),
        invoiceStatus: 'paid',
        webhookStatus: 'processed',
      })

      const readiness = finalReadiness!
      const state = finalState!
      subscriptionId = readiness.betterAuthSubscriptionId
      customerId = readiness.betterAuthCustomerId
      expect(subscriptionId).toEqual(expect.any(String))
      expect(customerId).toEqual(expect.any(String))

      const providerSubscription = await stripe.subscriptions.retrieve(subscriptionId!)
      const providerCustomer = providerCustomerId(providerSubscription.customer)
      expect(providerCustomer).toBe(customerId)
      expect(['active', 'trialing']).toContain(providerSubscription.status)

      const providerInvoiceId = typeof providerSubscription.latest_invoice === 'string'
        ? providerSubscription.latest_invoice
        : providerSubscription.latest_invoice?.id ?? null
      expect(providerInvoiceId).toBe(readiness.invoiceId)
      const providerInvoice = typeof providerSubscription.latest_invoice === 'string'
        ? await stripe.invoices.retrieve(providerSubscription.latest_invoice)
        : providerSubscription.latest_invoice
      expect(providerInvoice?.status).toBe('paid')

      const checkoutSession = await findCanaryCheckoutSession(stripe, subscriptionId!)
      expect(checkoutSession.status).toBe('complete')
      expect(checkoutSession.mode).toBe('subscription')
      expect(checkoutSession.subscription).toEqual(expect.anything())

      await writeStripeCanaryEvidence(config.evidencePath!, buildStripeCanaryEvidence({
        sourceSha: config.sourceSha!,
        baseUrl,
        workerVersionId: config.workerVersionId!,
        checkoutSessionId: checkoutSession.id,
        customerId: providerCustomer,
        subscriptionId,
        invoiceId: providerInvoice?.id ?? readiness.invoiceId!,
        webhookEventId: readiness.webhookEventId!,
        siteCount: readiness.siteCount,
        statuses: {
          checkout: checkoutSession.status,
          subscription: providerSubscription.status,
          invoice: providerInvoice?.status ?? 'unknown',
          webhook: readiness.webhookStatus!,
          organizationBilling: state.billing?.plan === 'growth' ? state.billing.status ?? 'unknown' : 'mismatch',
          entitlements: 'growth-projected',
          sites: { expected: createdSiteIds.length, observed: readiness.siteCount, plan: 'growth' },
        },
      }))
    } finally {
      try {
        await cleanupStripeResources(stripe, organizationId, startedAt, subscriptionId, customerId)
      } catch {
        // Do not print Stripe error objects: they can include provider IDs or
        // request metadata. A failed cleanup fails this gate without leaking it.
        cleanupFailed = true
      }
    }
    if (cleanupFailed) throw new Error('Stripe test-mode canary provider cleanup failed')
  })
})
