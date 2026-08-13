import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from '@playwright/test'
import { dashboardOrgHeaders, devLoginHeaders, devLoginUrl } from './test-env'

async function loginFreshUser(request: APIRequestContext, baseURL: string, userId: string) {
  const res = await request.get(devLoginUrl(baseURL, userId), {
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

const TRANSFER_SOURCE_OWNER_USER_ID = 'user-mcp-growth-service'
const TRANSFER_RECIPIENT_USER_IDS: Record<TransferPlan, string> = {
  free: 'user-mcp-free',
  growth: 'user-mcp-growth',
}

async function openTransferOnboarding(
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
  // The source site is deliberately always created by the seeded Growth
  // service fixture owner. The accepting user already owns the
  // seeded free or Growth fixture organization for this case. This keeps the
  // assertion meaningful under the one-org subscription model: the transferred
  // site's plan must come from the recipient organization, not the source site's
  // denormalized plan and not a newly-created recipient org.
  const ownerUserId = TRANSFER_SOURCE_OWNER_USER_ID
  const recipientUserId = TRANSFER_RECIPIENT_USER_IDS[plan]
  const recipientEmail = `${recipientUserId}@example.test`

  // Build the fixture through the real transfer APIs. The recipient's seeded
  // organization supplies the effective free/Growth plan without starting a
  // Stripe checkout; the transfer itself remains a no-payment handoff.
  const ownerRequest = await playwrightRequest.newContext()
  let siteId = ''
  let siteSlug = ''
  let transfer: { id?: string; token?: string } = {}
  try {
    await loginFreshUser(ownerRequest, baseURL, ownerUserId)
    const createSiteRes = await ownerRequest.post(`${baseURL}/api/sites`, {
      data: {
        name: `Transfer UI ${plan} ${suffix}`,
        subdomain: `e2e-throwaway-${suffix}`,
        vertical: 'restaurant',
      },
    })
    expect(createSiteRes.status()).toBe(200)
    const createdSite = await createSiteRes.json() as {
      siteId?: string
      subdomain?: string
    }
    expect(createdSite.siteId).toEqual(expect.any(String))
    expect(createdSite.subdomain).toContain('e2e-')
    siteId = createdSite.siteId!
    siteSlug = createdSite.subdomain!

    // Keep the source/recipient plan distinction explicit. The source fixture is
    // Growth for both cases; the free case must be resolved by the recipient
    // organization's projection during transfer acceptance.
    const [sourceSiteRes, transferRes] = await Promise.all([
      ownerRequest.get(`${baseURL}/api/sites/${siteId}`),
      ownerRequest.post(`${baseURL}/api/admin/sites/${siteId}/transfer`, {
        data: {
          email: recipientEmail,
          message: 'Transfer onboarding E2E fixture.',
        },
      }),
    ])
    expect(sourceSiteRes.status()).toBe(200)
    const sourceSite = await sourceSiteRes.json() as { plan?: string }
    expect(sourceSite.plan).toBe('growth')

    expect(transferRes.status()).toBe(200)
    transfer = await transferRes.json() as { id?: string; token?: string }
    expect(transfer.id).toEqual(expect.any(String))
    expect(transfer.token).toEqual(expect.any(String))
  } finally {
    await ownerRequest.dispose()
  }

  await loginFreshUser(page.request, baseURL, recipientUserId)
  const acceptRes = await page.request.post(`${baseURL}/api/site-transfer/${transfer.token}/accept`, {
    data: {},
  })
  expect(acceptRes.status()).toBe(200)
  const acceptBody = await acceptRes.json() as { success?: boolean; site_id?: string }
  expect(acceptBody.success).toBe(true)
  expect(acceptBody.site_id).toBe(siteId)

  const [contextRes, locationsRes] = await Promise.all([
    page.request.get(`${baseURL}/api/dashboard/context`),
    page.request.get(`${baseURL}/api/sites/${siteId}/locations`),
  ])
  expect(contextRes.status()).toBe(200)
  const context = await contextRes.json() as {
    organization?: { id?: string; slug?: string }
    sites?: Array<{ id?: string; plan?: string }>
  }
  const orgSlug = context.organization?.slug
  expect(orgSlug).toEqual(expect.any(String))
  expect(context.sites?.some(site => site.id === siteId && site.plan === plan)).toBe(true)

  expect(locationsRes.status()).toBe(200)
  const locationsBody = await locationsRes.json() as {
    locations?: Array<{ id?: string }>
  }
  const locationId = locationsBody.locations?.[0]?.id
  expect(locationId).toEqual(expect.any(String))

  await page.route(`**/api/editor/sites/${siteId}/notifications`, async route => {
    if (route.request().method() !== 'PATCH') return await route.continue()
    await route.fulfill({
      status: notificationSaveStatus,
      contentType: 'application/json',
      body: JSON.stringify(notificationSaveStatus >= 400
        ? { error: notificationSaveError }
        : { success: true, notifications: { whatsapp_phone: '+15555550100', channels: ['whatsapp'] } }),
    })
  })

  await page.route(`**/api/dashboard/locations/${locationId!}`, async route => {
    if (route.request().method() !== 'PATCH') return await route.continue()
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

  let transferContextRequests = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/dashboard/transfer-onboarding-context') {
      transferContextRequests += 1
    }
  })
  const onboardingUrl = `${baseURL}/dashboard/${orgSlug}/onboarding?transfer=${encodeURIComponent(transfer.id!)}`
  await page.goto(onboardingUrl, { waitUntil: 'domcontentloaded' })
  expect(new URL(page.url()).searchParams.get('transfer')).toBe(transfer.id)
  await expect(page.getByText('Your site is ready')).toBeVisible()
  await expect(page.getByRole('button', { name: "Let's go" })).toBeEnabled()
  expect(transferContextRequests).toBe(0)

  return { siteId, orgSlug: orgSlug!, siteSlug, transferId: transfer.id! }
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
    await loginFreshUser(page.request, baseURL!, userId)

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
    await loginFreshUser(page.request, baseURL!, userId)

    // Mobile-first layout check: the picker must render cleanly (all three
    // choices reachable) at a small viewport. Reload fresh at desktop size
    // afterward so the actual completion flow below starts from "welcome"
    // again rather than continuing mid-flow from this mobile-only check.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })
    await expect(page.locator('[data-onboarding-hydrated="true"]')).toBeVisible()
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
    const { siteId, orgSlug, siteSlug } = await openTransferOnboarding(page, baseURL!, { plan: 'free' })

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
    const { siteId, orgSlug, siteSlug } = await openTransferOnboarding(page, baseURL!, { plan: 'growth' })

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
    const { siteId } = await openTransferOnboarding(page, baseURL!, {
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
    await loginFreshUser(page.request, baseURL!, userId)

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
