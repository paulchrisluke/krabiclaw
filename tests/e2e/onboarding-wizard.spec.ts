import { expect, test, type Page } from '@playwright/test'
import { dashboardOrgHeaders, devLoginHeaders, devLoginUrl } from './test-env'

async function loginFreshUser(page: Page, baseURL: string, userId: string) {
  const res = await page.request.get(devLoginUrl(baseURL, userId), {
    headers: devLoginHeaders(),
    maxRedirects: 0,
  })
  expect(res.status()).toBe(302)
}

// Drives the chat-style OnboardingWizard from "Start building" through the
// manual (no Google Maps) path, since that path has no third-party dependency.
// This test's own `skipVertical` option must match whether the wizard itself
// skips the vertical step for the mode under test (add-location mode always
// skips it — see OnboardingWizard.vue's `skipVertical` computed, derived from
// `mode="add-location"`) — the vertical step never renders there, so waiting
// on it would hang.
// The add-location flow (pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/new.vue) stays on /locations/new and
// shows a live preview of the new location instead of navigating away, so
// every call site waits on the wizard's own "Done" message.
async function completeManualWizard(
  page: Page,
  businessName: string,
  { skipVertical = false, skipSuccessAssertion = false, vertical = 'restaurant' as 'restaurant' | 'experience' | 'professional_service' } = {},
) {
  const activeWidget = page.locator('.onboarding-step-widget').last()
  const actionButton = (name: string | RegExp) => activeWidget.getByRole('button', { name })
  const expectNoHistoricalControls = async () => {
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Skip for now' })).toHaveCount(0)
  }

  await expect(page.locator('[data-onboarding-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Start building' }).click()
  if (!skipVertical) {
    const verticalLabel = vertical === 'professional_service'
      ? /Legal or professional services/
      : vertical === 'experience'
        ? /Experience, class or activity/
        : /Restaurant, café or bar/
    await page.getByRole('button', { name: verticalLabel }).click()
  }
  await page.getByRole('button', { name: /Start manually/ }).click()
  const input = page.getByPlaceholder('Your business name…')
  await input.fill(businessName)
  await input.press('Enter')
  await expect(page.getByText('Where should guests find you?')).toBeVisible({ timeout: 15_000 })
  if (!skipVertical) {
    await expect(page.locator('iframe[title="Site preview"]').first()).toHaveAttribute('src', /\/preview\/draft\/[^?]+\?preview=true&token=/, { timeout: 15_000 })
  }
  await expectNoHistoricalControls()
  await page.getByLabel('Street address').fill('123 Moo 5, Ao Nang, Krabi')
  await page.getByLabel('City or town').fill('Ao Nang')
  await actionButton('Save location').click()
  await expect(page.getByText('Add the number guests should use first.')).toBeVisible()
  await expectNoHistoricalControls()
  await page.getByRole('textbox', { name: /\(___\) ___-____/ }).fill('4233586761')
  await actionButton('Save contact').click()
  await expect(page.getByText('Choose how guests will see prices.')).toBeVisible()
  await expectNoHistoricalControls()
  await actionButton('Use this currency').click()
  await expect(page.getByText('Add your weekly hours so bookings and visit details line up.')).toBeVisible()
  await expectNoHistoricalControls()
  await actionButton('Save hours').click()
  await expect(page.getByText('Choose the color and logo guests will recognize across your site.')).toBeVisible()
  await expectNoHistoricalControls()
  await actionButton('Save brand').click()
  await expect(page.getByText('Add the photo and opening words guests see first on the homepage.')).toBeVisible()
  await expectNoHistoricalControls()
  await actionButton('Save hero').click()
  if (!skipVertical) {
    await expect(page.getByText('Draft ready. Tap the preview any time')).toBeVisible()
    await expect(page.getByText('Tap to preview your site')).toBeVisible()
    await page.getByRole('button', { name: 'Create site' }).click()
  }
  if (!skipSuccessAssertion) {
    try {
      await expect(page.getByText('Done. Your workspace is live')).toBeVisible({ timeout: 60_000 })
    } catch (waitError) {
      const bannerText = await page.getByTestId('wizard-error-banner').textContent().catch(() => null)
      throw new Error(`site creation never reached "Done"${bannerText ? ` — wizard error banner: ${bannerText}` : ' (no error banner visible either)'}`, { cause: waitError })
    }
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

  // Signup no longer auto-creates an org (see server/utils/auth.ts) — this test
  // navigates to a real /dashboard/{orgSlug}/... route (only the site/location
  // data below is mocked), so the fresh user needs a real org to belong to.
  // Creating a throwaway site is the same on-demand path a first-time user
  // actually goes through; its own siteId/slug are unused below since the
  // mocked routes take over as soon as the wizard loads.
  const createSiteRes = await page.request.post(`${baseURL}/api/sites`, {
    data: {
      name: `Throwaway Org ${suffix}`,
      subdomain: `e2e-throwaway-${suffix}`,
      vertical: 'restaurant',
    },
  })
  expect(createSiteRes.status()).toBe(200)

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

  await page.route(`**/api/sites/${siteId}/locations`, async route => {
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

  await page.goto(`${baseURL}/dashboard/${orgSlug}/onboarding`, { waitUntil: 'load' })

  return { siteId, orgSlug: orgSlug!, siteSlug }
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

  test('a new user can build a site manually and open the dashboard', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const suffix = Date.now()
    const userId = `e2e-onboard-${suffix}`
    await loginFreshUser(page, baseURL!, userId)

    let onboardingContextRequests = 0
    let legacyContextRequests = 0
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (pathname === '/api/dashboard/onboarding-context') onboardingContextRequests += 1
      if (
        pathname === '/api/dashboard/context'
        || pathname === '/api/dashboard/onboarding/checklist'
        || /^\/api\/editor\/sites\/[^/]+\/context$/.test(pathname)
      ) {
        legacyContextRequests += 1
      }
    })

    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await expect.poll(() => onboardingContextRequests).toBe(0)
    expect(legacyContextRequests).toBe(0)
    await completeManualWizard(page, `Onboard Test Cafe ${suffix}`)
    await expect.poll(() => onboardingContextRequests).toBe(1)
    expect(legacyContextRequests).toBe(0)
    await expect(page.getByText('From here, head to your dashboard to keep building')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add another location' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Open my dashboard' }).click()
    await expect(page).toHaveURL(/\/dashboard\/[^/]+\/sites\/[^/]+$/)
  })

  test('wizard shows all three business-type choices on mobile and desktop, and Legal/professional services creates a Blawby site', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    const suffix = Date.now()
    const userId = `e2e-onboard-pro-${suffix}`
    await loginFreshUser(page, baseURL!, userId)

    // Mobile-first layout check: the picker must render cleanly (all three
    // choices reachable) at a small viewport. Reload fresh at desktop size
    // afterward so the actual completion flow below starts from "welcome"
    // again rather than continuing mid-flow from this mobile-only check.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Start building' }).click()
    await expect(page.getByRole('button', { name: /Restaurant, café or bar/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Experience, class or activity/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Legal or professional services/ })).toBeVisible()

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await completeManualWizard(page, `e2e- Onboard Test Firm ${suffix}`, { vertical: 'professional_service' })
    await page.getByRole('button', { name: 'Open my dashboard' }).click()
    await expect(page).toHaveURL(/\/dashboard\/[^/]+\/sites\/[^/]+$/)

    const pathSegments = new URL(page.url()).pathname.split('/')
    const orgSlug = pathSegments[2]
    const siteSlug = pathSegments[4]
    const contextRes = await page.request.get(`${baseURL}/api/dashboard/context`, {
      headers: {
        ...dashboardOrgHeaders(orgSlug!),
        'x-dashboard-site-slug': siteSlug!,
      },
    })
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { site?: { id?: string; vertical?: string } }
    expect(context.site?.vertical).toBe('service')

    const siteRes = await page.request.get(`${baseURL}/api/sites/${context.site?.id}`)
    expect(siteRes.status()).toBe(200)
    const site = await siteRes.json() as { theme_id: string; vertical: string }
    expect(site.theme_id).toBe('blawby-theme-v1')
    expect(site.vertical).toBe('service')
  })

  test('transfer handoff wizard saves free-plan notifications and skips paid-only steps', async ({ page, baseURL }) => {
    const { siteId, orgSlug, siteSlug } = await openMockedTransferOnboarding(page, baseURL!, { plan: 'free' })

    await reachNotificationStep(page)
    const saveResponse = await saveNotificationSettings(page, siteId)
    expect(saveResponse.status()).toBe(200)

    await expect(page.getByText('Team access')).toBeVisible()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    await expect(page.getByText('Facebook and Instagram sync')).not.toBeVisible()
    await expect(page.getByText('Custom domain setup')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible()
    await page.getByRole('button', { name: 'Go to my dashboard' }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/${orgSlug}/sites/${siteSlug}$`))
  })

  test('transfer handoff wizard shows paid-plan social and domain steps', async ({ page, baseURL }) => {
    const { siteId, orgSlug, siteSlug } = await openMockedTransferOnboarding(page, baseURL!, { plan: 'growth' })

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
    await expect(page).toHaveURL(new RegExp(`/dashboard/${orgSlug}/sites/${siteSlug}$`))
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

  test('a failed post-creation context refresh surfaces a terminal error instead of silently reapplying stale context', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const suffix = Date.now()
    const userId = `e2e-onboard-retry-${suffix}`
    await loginFreshUser(page, baseURL!, userId)

    // Initial load succeeds via real SSR (no HTTP request for page.route to
    // intercept — see loadContextResource's import.meta.server branch), so
    // this mock only ever affects the later client-side refresh triggered by
    // onSiteCreated -> retryContext() below, exactly the "successful load,
    // then a later failed refresh" scenario Nuxt's stale-data-retention
    // behavior can hide (see pages/dashboard/onboarding.vue's loadContext).
    await page.route('**/api/dashboard/onboarding-context', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Workspace context unavailable' } }),
      })
    })

    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await expect(page.locator('.onboarding-step-widget').first()).toBeVisible()
    await completeManualWizard(page, `Onboard Retry Test ${suffix}`, { skipSuccessAssertion: true })

    // Forbidden: the wizard's own post-creation success view (or any stale
    // pre-creation context) must not render as if the refresh had succeeded.
    await expect(page.getByText('From here, head to your dashboard to keep building')).not.toBeVisible()
    await expect(page.getByText('Workspace could not be loaded')).toBeVisible()
  })
})
