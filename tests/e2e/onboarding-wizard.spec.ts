import { expect, test, type Page } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'

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
// The add-location flow (pages/dashboard/[orgSlug]/sites/[siteSlug]/new.vue) stays on /new and
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
  await page.getByLabel('Manager alert number').fill('+66812345678')
  await page.getByRole('button', { name: /Create site|Add location/ }).click()
  // New-site creation now stages a private draft first ("Draft ready...") and
  // needs a second "Create site" quick-reply click to commit it; adding a
  // location to an existing site skips drafting and goes straight to "Done".
  // The quick-reply chip is tagged with data-reply-action so it can be targeted
  // unambiguously — the original form button (same "Create site" label) stays
  // visible and re-enabled in the chat transcript once the draft save completes,
  // so a text/role locator alone (or DOM-order .last()) can't reliably tell them apart.
  const draftOrDone = page.getByText(/Draft ready\.|Done\. Your workspace is live/)
  // Site/location creation does several sequential D1 round trips (org lookup,
  // location insert, review upserts) against a remote preview deploy, which can
  // outrun a 15s wait even though the wizard's own bot-message delay is fixed at ~640ms.
  await expect(draftOrDone.first()).toBeVisible({ timeout: 30_000 })
  if (await page.getByText('Draft ready.').isVisible().catch(() => false)) {
    await page.locator('[data-testid="wizard-quick-reply"][data-reply-action="commit_draft"]').click()
    // Commit chains several sequential round trips (runSiteCreation, primary location
    // update, the content/menu/qa/posts/reviews batch insert, then currency + social
    // status follow-ups) — give this more headroom than the draft-save wait above.
    await expect(page.getByText('Done. Your workspace is live')).toBeVisible({ timeout: 45_000 })
  }
}

type TransferPlan = 'free' | 'growth'

async function openMockedTransferOnboarding(
  page: Page,
  baseURL: string,
  {
    plan = 'free',
    notificationSaveStatus = 200,
    notificationSaveError = 'Notification routing could not be saved.',
  }: {
    plan?: TransferPlan
    notificationSaveStatus?: number
    notificationSaveError?: string
  } = {},
) {
  const suffix = Date.now()
  const userId = `e2e-transfer-ui-${plan}-${suffix}`
  const siteId = `site-transfer-ui-${suffix}`
  const siteSlug = `transfer-site-${suffix}`
  const locationId = `loc-transfer-ui-${suffix}`

  await loginFreshUser(page, baseURL, userId)
  const contextRes = await page.request.get(`${baseURL}/api/dashboard/context`)
  expect(contextRes.status()).toBe(200)
  const context = await contextRes.json() as { organization?: { id?: string; slug?: string } }
  const orgId = context.organization?.id
  const orgSlug = context.organization?.slug
  expect(orgId).toBeTruthy()
  expect(orgSlug).toBeTruthy()

  await page.route('**/api/dashboard/context?afterTransfer=true', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        organization: { id: orgId, slug: orgSlug },
        site: {
          id: siteId,
          brand_name: 'Mock Transfer Site',
          vertical: 'restaurant',
          subdomain: siteSlug,
          plan,
        },
      }),
    })
  })

  await page.route('**/api/dashboard/locations', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        locations: [
          {
            id: locationId,
            title: 'Mock Transfer Location',
            slug: 'mock-transfer-location',
            is_primary: true,
            notification_phone: null,
          },
        ],
      }),
    })
  })

  await page.route(`**/api/editor/sites/${siteId}/notifications`, async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: notificationSaveStatus,
        contentType: 'application/json',
        body: JSON.stringify(notificationSaveStatus >= 400
          ? { error: notificationSaveError }
          : { success: true, notifications: { whatsapp_phone: '+15555550100', channels: ['whatsapp'] } }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, notifications: { whatsapp_phone: null, channels: ['whatsapp'] } }),
    })
  })

  await page.route(`**/api/dashboard/locations/${locationId}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, location: { id: locationId } }),
    })
  })

  await page.route(`**/preview/site/${siteId}**`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Mock preview</title><main>Mock preview</main>',
    })
  })

  await page.goto(`${baseURL}/dashboard/${orgSlug}/~/onboarding`, { waitUntil: 'load' })

  return { siteId, orgSlug: orgSlug! }
}

async function saveNotificationSettings(page: Page, siteId: string) {
  await expect(page.getByText('Your owner number gets every booking')).toBeVisible()
  await page.getByPlaceholder('+447464115465').fill('+15555550100')
  const saveResponse = page.waitForResponse(response =>
    response.url().includes(`/api/editor/sites/${siteId}/notifications`)
    && response.request().method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Save notification settings' }).click()
  return saveResponse
}

async function reachNotificationStep(page: Page) {
  await page.getByRole('button', { name: "Let's go" }).click()
  await page.getByRole('button', { name: 'Looks great, continue' }).click()
}

test.describe('onboarding wizard UI', () => {
  test.describe.configure({ mode: 'serial' })

  test('a new user can build a site manually and add a second location manually', async ({ page, baseURL }) => {
    // Two full manual wizard completions (site + second location) routinely
    // exceed the default 30s test timeout against a remote preview deploy. Each
    // completion can wait up to 30s for the draft save plus 45s for the commit
    // chain (worst case), so give the overall test enough budget for both.
    test.setTimeout(180_000)
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

    const pathSegments = new URL(page.url()).pathname.split('/')
    const orgSlug = pathSegments[2]
    const siteSlug = pathSegments[4]
    // page.request bypasses the browser's JS entirely, so the dashboard-site-header
    // plugin never runs — the site must be named explicitly via the header it would
    // otherwise attach, since /api/dashboard/locations requires an explicit site.
    const locationsRes = await page.request.get(`${baseURL}/api/dashboard/locations`, {
      headers: { 'x-dashboard-site-slug': siteSlug! },
    })
    expect(locationsRes.status()).toBe(200)
    const { locations } = await locationsRes.json() as { locations: Array<{ title: string }> }
    expect(locations.length).toBeGreaterThanOrEqual(2)
    expect(orgSlug).toBeTruthy()
  })

  test('transfer handoff wizard saves free-plan notifications and skips paid-only steps', async ({ page, baseURL }) => {
    const { siteId, orgSlug } = await openMockedTransferOnboarding(page, baseURL!, { plan: 'free' })

    await reachNotificationStep(page)
    const saveResponse = await saveNotificationSettings(page, siteId)
    expect(saveResponse.status()).toBe(200)

    await expect(page.getByText('Team access')).toBeVisible()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    await expect(page.getByText('Facebook and Instagram sync')).not.toBeVisible()
    await expect(page.getByText('Custom domain setup')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible()
    await page.getByRole('button', { name: 'Go to my dashboard' }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/${orgSlug}$`))
  })

  test('transfer handoff wizard shows paid-plan social and domain steps', async ({ page, baseURL }) => {
    const { siteId, orgSlug } = await openMockedTransferOnboarding(page, baseURL!, { plan: 'growth' })

    await reachNotificationStep(page)
    const saveResponse = await saveNotificationSettings(page, siteId)
    expect(saveResponse.status()).toBe(200)

    await expect(page.getByText('Team access')).toBeVisible()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    await expect(page.getByText('Facebook and Instagram sync')).toBeVisible()
    await page.getByRole('button', { name: 'Set up later' }).first().click()

    await expect(page.getByText('Custom domain setup')).toBeVisible()
    await page.getByRole('button', { name: 'Set up later' }).last().click()

    await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible()
    await page.getByRole('button', { name: 'Go to my dashboard' }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/${orgSlug}$`))
  })

  test('transfer handoff wizard keeps notification save failures visible', async ({ page, baseURL }) => {
    const saveError = 'whatsapp_phone is required'
    const { siteId } = await openMockedTransferOnboarding(page, baseURL!, {
      plan: 'free',
      notificationSaveStatus: 400,
      notificationSaveError: saveError,
    })

    await reachNotificationStep(page)
    const saveResponse = await saveNotificationSettings(page, siteId)
    expect(saveResponse.status()).toBe(400)

    await expect(page.locator('div[role="alert"]').filter({ hasText: saveError })).toBeVisible()
    await expect(page.getByText('Team access')).not.toBeVisible()
  })
})
