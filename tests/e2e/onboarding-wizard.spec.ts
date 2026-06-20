import { expect, test, type Page } from '@playwright/test'
import { devLoginHeaders, devLoginUrl, testEnv } from './test-env'

const STRIPE_CONFIGURED = Boolean(testEnv('STRIPE_SECRET_KEY') && testEnv('NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'))

async function loginFreshUser(page: Page, baseURL: string, userId: string) {
  const res = await page.request.get(devLoginUrl(baseURL, userId), {
    headers: devLoginHeaders(),
    maxRedirects: 0,
  })
  expect(res.status()).toBe(302)
}

// Drives the chat-style OnboardingWizard from "Start building" through the
// manual (no Google Maps) path, since that path has no third-party dependency.
// `skipVertical` must match the wizard's own skip-vertical prop at the call
// site (true on the add-location flow) — the vertical step never renders
// there, so waiting on it would hang.
// The add-location flow (pages/dashboard/[orgSlug]/new.vue) stays on /new and
// shows a live preview of the new location instead of navigating away, so
// every call site waits on the wizard's own "Done" message.
async function completeManualWizard(
  page: Page,
  businessName: string,
  { skipVertical = false } = {},
) {
  await page.getByRole('button', { name: 'Start building' }).click()
  if (!skipVertical) {
    await page.getByRole('button', { name: /Restaurant, café or bar/ }).click()
  }
  await page.getByRole('button', { name: /Start manually/ }).click()
  const input = page.getByPlaceholder('Your business name…')
  await input.fill(businessName)
  await input.press('Enter')
  await expect(page.getByText(/Business details|Location details/)).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('City').fill('Ao Nang')
  await page.getByLabel('Address').fill('123 Moo 5, Ao Nang, Krabi')
  await page.getByLabel('Phone').fill('+66812345678')
  await page.getByLabel('Hours').fill('Monday: 9:00 AM - 6:00 PM\nTuesday: 9:00 AM - 6:00 PM')
  await page.getByRole('button', { name: /Create site|Add location/ }).click()
  await expect(page.getByText('Done. Your workspace is live')).toBeVisible({ timeout: 15_000 })
}

test.describe('onboarding wizard UI', () => {
  test('a new user can build a site manually and add a second location manually', async ({ page, baseURL }) => {
    // Two full manual wizard completions (site + second location) routinely
    // exceed the default 30s test timeout against a remote preview deploy.
    test.setTimeout(90_000)
    const suffix = Date.now()
    const userId = `e2e-onboard-${suffix}`
    await loginFreshUser(page, baseURL!, userId)

    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await completeManualWizard(page, `Onboard Test Cafe ${suffix}`)

    await page.getByRole('button', { name: 'Add another location' }).click()
    await expect(page).toHaveURL(/\/dashboard\/.+\/new$/)

    // Regression coverage: manual location entry used to call the new-site
    // onboarding endpoint, which rejects any user who already has a site.
    await completeManualWizard(page, `Onboard Test Cafe Second Location ${suffix}`, {
      skipVertical: true,
    })
    // Adding a location stays on /new with a live preview of the new location.
    await expect(page).toHaveURL(/\/dashboard\/.+\/new$/)

    const orgSlug = new URL(page.url()).pathname.split('/')[2]
    const locationsRes = await page.request.get(`${baseURL}/api/dashboard/locations`)
    expect(locationsRes.status()).toBe(200)
    const { locations } = await locationsRes.json() as { locations: Array<{ title: string }> }
    expect(locations.length).toBeGreaterThanOrEqual(2)
    expect(orgSlug).toBeTruthy()
  })

  test('transfer handoff wizard walks a free-plan recipient through notifications and team, skipping social/domain', async ({ page, baseURL }) => {
    // Two full manual wizard completions plus the transfer handoff walkthrough
    // routinely exceed the default 30s test timeout against a remote preview deploy.
    test.setTimeout(90_000)
    const suffix = Date.now()
    const ownerUserId = `e2e-transfer-owner-${suffix}`
    const recipientUserId = `e2e-transfer-recipient-${suffix}`

    // Owner creates a free-plan site to hand off.
    await loginFreshUser(page, baseURL!, ownerUserId)
    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await completeManualWizard(page, `Handoff Source ${suffix}`)
    const ownerContext = await (await page.request.get(`${baseURL}/api/dashboard/context`)).json() as {
      restaurant?: { id: string }
    }
    const sourceSiteId = ownerContext.restaurant?.id
    expect(sourceSiteId).toBeTruthy()

    // Recipient needs an existing owner org to accept into (mirrors a real signup).
    await loginFreshUser(page, baseURL!, recipientUserId)
    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await completeManualWizard(page, `Recipient Home Base ${suffix}`)
    const recipientSessionRes = await page.request.get(`${baseURL}/api/auth/get-session`)
    const recipientSession = await recipientSessionRes.json() as { user?: { email?: string } }
    const recipientEmail = recipientSession.user?.email
    expect(recipientEmail).toEqual(expect.any(String))

    // Owner initiates a free transfer (no `plan` in body => requires_payment: false).
    await loginFreshUser(page, baseURL!, ownerUserId)
    const createRes = await page.request.post(`${baseURL}/api/admin/sites/${sourceSiteId}/transfer`, {
      data: { email: recipientEmail, message: 'Free handoff for e2e.' },
    })
    expect(createRes.status()).toBe(200)
    const created = await createRes.json() as { token: string; requires_payment: boolean }
    expect(created.requires_payment).toBe(false)

    // Recipient accepts — executes immediately, no Stripe involved.
    await loginFreshUser(page, baseURL!, recipientUserId)
    const acceptRes = await page.request.post(`${baseURL}/api/site-transfer/${created.token}/accept`)
    expect(acceptRes.status()).toBe(200)

    const recipientContext = await (await page.request.get(`${baseURL}/api/dashboard/context`)).json() as {
      organization?: { slug?: string }
    }
    const orgSlug = recipientContext.organization?.slug
    expect(orgSlug).toBeTruthy()

    await page.goto(`${baseURL}/dashboard/${orgSlug}/~/onboarding`, { waitUntil: 'load' })
    await page.getByRole('button', { name: "Let's go" }).click()
    await page.getByRole('button', { name: 'Looks great, continue' }).click()
    await expect(page.getByText('Your owner number gets every booking')).toBeVisible()
    await page.getByPlaceholder('+447464115465').fill('+15555550100')
    await page.getByRole('button', { name: 'Save notification settings' }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    // Free plan must not show the paid-only social/domain steps.
    await expect(page.getByText('Facebook and Instagram sync')).not.toBeVisible()
    await expect(page.getByText('Custom domain setup')).not.toBeVisible()

    await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Go to my dashboard' }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/${orgSlug}$`))
  })

  test('transfer handoff wizard shows social and domain steps on a paid plan', async ({ page, baseURL, request }) => {
    test.skip(!STRIPE_CONFIGURED, 'Stripe must be configured for the paid handoff flow test.')
    test.setTimeout(90_000)

    const POTTERY_OWNER_USER_ID = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'
    const RECIPIENT_USER_ID = 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re'
    const SITE_ID = 'site-pottery-house'

    await request.post(`${baseURL}/api/dev/site-transfer-reset`, {
      headers: devLoginHeaders(),
      data: { siteId: SITE_ID, organizationId: 'org-pottery-house' },
    })

    const recipientLoginRes = await page.request.get(devLoginUrl(baseURL!, RECIPIENT_USER_ID), { headers: devLoginHeaders(), maxRedirects: 0 })
    expect(recipientLoginRes.status()).toBe(302)
    const recipientSessionRes = await page.request.get(`${baseURL}/api/auth/get-session`)
    const recipientSession = await recipientSessionRes.json() as { user?: { email?: string } }
    const recipientEmail = recipientSession.user?.email
    const recipientContextBefore = await (await page.request.get(`${baseURL}/api/dashboard/context`)).json() as {
      organization?: { id?: string; slug?: string }
    }
    const targetOrgId = recipientContextBefore.organization?.id
    const orgSlug = recipientContextBefore.organization?.slug

    const ownerLoginRes = await page.request.get(devLoginUrl(baseURL!, POTTERY_OWNER_USER_ID), { headers: devLoginHeaders(), maxRedirects: 0 })
    expect(ownerLoginRes.status()).toBe(302)
    const create = await page.request.post(`${baseURL}/api/admin/sites/${SITE_ID}/transfer`, {
      data: { email: recipientEmail, plan: 'growth', message: 'Paid handoff for e2e.' },
    })
    const created = await create.json() as { id: string; token: string }

    const recipientLoginRes2 = await page.request.get(devLoginUrl(baseURL!, RECIPIENT_USER_ID), { headers: devLoginHeaders(), maxRedirects: 0 })
    expect(recipientLoginRes2.status()).toBe(302)
    const acceptRes = await page.request.post(`${baseURL}/api/site-transfer/${created.token}/accept`)
    expect(acceptRes.ok()).toBeTruthy()

    const payload = JSON.stringify({
      id: `evt_transfer_ui_${Date.now()}`,
      object: 'event',
      api_version: '2025-04-30.basil',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_transfer_ui_${Date.now()}`,
          object: 'checkout.session',
          customer: `cus_transfer_ui_${Date.now()}`,
          metadata: {
            type: 'site_transfer',
            organization_id: targetOrgId,
            plan: 'growth',
            transfer_request_id: created.id,
            transfer_site_id: SITE_ID,
            transfer_claiming_user_id: RECIPIENT_USER_ID,
            transfer_claiming_organization_id: targetOrgId,
          },
          subscription: {
            id: `sub_transfer_ui_${Date.now()}`,
            items: { data: [{ id: `si_transfer_ui_${Date.now()}` }] },
            billing_cycle_anchor: Math.floor(Date.now() / 1000) + 86400,
          },
        },
      },
    })

    const signatureRes = await page.request.post(`${baseURL}/api/dev/stripe-signature`, {
      headers: devLoginHeaders(),
      data: { payload },
    })
    const { signature } = await signatureRes.json() as { signature: string }

    const webhookRes = await page.request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
        ...(devLoginHeaders() || {}),
      },
      data: payload,
    })
    expect(webhookRes.status()).toBe(200)

    expect(orgSlug).toBeTruthy()

    await page.goto(`${baseURL}/dashboard/${orgSlug}/~/onboarding`, { waitUntil: 'load' })
    await page.getByRole('button', { name: "Let's go" }).click()
    await page.getByRole('button', { name: 'Looks great, continue' }).click()
    await page.getByRole('button', { name: 'Save notification settings' }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    await expect(page.getByText('Facebook and Instagram sync')).toBeVisible()
    await page.getByRole('button', { name: 'Set up later' }).first().click()

    await expect(page.getByText('Custom domain setup')).toBeVisible()
    await page.getByRole('button', { name: 'Set up later' }).last().click()

    await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Go to my dashboard' }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/${orgSlug}$`))
  })
})
