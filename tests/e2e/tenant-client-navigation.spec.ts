// Regression coverage for krabiclaw #436/#437: client-side navigation on a
// tenant Saya site must never render another page's (or an empty-state)
// content while its own bootstrap fetch is still in flight. See
// composables/useBootstrap.ts and composables/useSiteShell.ts for the fix.
//
// The bootstrap XHR is deliberately delayed via route interception so the
// race window is wide enough to observe deterministically — on unthrottled
// local/CI networks the fetch can resolve fast enough that a regression
// wouldn't reliably show up otherwise.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { tenantBaseURL, tenantExtraHeaders, setupTenantHeaders } from './helpers'

async function setupNavigationTest(page: Page) {
  // This suite validates live loader transitions. Persistent Miniflare HTML
  // cache can otherwise replay an SSR document from an earlier test run and
  // prevent the browser from exercising the current loader implementation.
  await page.setExtraHTTPHeaders({ 'cache-control': 'no-cache' })

  // Defeat NuxtLink's viewport-based prefetch so the bootstrap fetch only
  // happens on the actual click, not ahead of time.
  await page.addInitScript(() => {
    class NoopObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    }
    // @ts-expect-error test-only stub
    window.IntersectionObserver = NoopObserver
  })
}

async function navigateAndAssertNonBlocking(page: Page, opts: {
  fromPath: string
  linkHref: string
  beforeText: string
  afterText: string
  forbiddenTexts: string[]
}) {
  await page.goto(`${tenantBaseURL}${opts.fromPath}`, { waitUntil: 'load' })
  await expect(page.locator('body')).toContainText(opts.beforeText)

  let releasePageRequest!: () => void
  const pageRequestPaused = new Promise<void>((resolve) => {
    releasePageRequest = resolve
  })
  let markPageRequestPaused!: () => void
  const sawPausedPageRequest = new Promise<void>((resolve) => {
    markPageRequestPaused = resolve
  })
  await page.route('**/api/public/sites/*/page*', async (route) => {
    markPageRequestPaused()
    await pageRequestPaused
    await route.continue()
  })

  const link = page.locator(`a[href="${opts.linkHref}"]`).first()
  await link.click()
  await sawPausedPageRequest

  // These assertions execute while the destination API request is still
  // paused. They distinguish an immediate route transition from Suspense
  // retaining the previous page until data arrives.
  await expect(page).toHaveURL(new RegExp(`${opts.linkHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
  await expect(page.locator(`[data-route-shell="${opts.linkHref}"]`)).toBeVisible()
  await expect(page.getByTestId('public-route-loading')).toBeVisible()
  await expect(page.locator('main')).not.toContainText(opts.beforeText)
  for (const forbidden of opts.forbiddenTexts) {
    await expect(page.locator('main')).not.toContainText(forbidden)
  }

  releasePageRequest()
  await expect(page.locator('body')).toContainText(opts.afterText)
}

test.describe('tenant client-side navigation does not show stale/fallback content', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, tenantBaseURL, tenantExtraHeaders)
    await setupNavigationTest(page)
  })

  test('Home -> About', async ({ page }) => {
    await navigateAndAssertNonBlocking(page, {
      fromPath: '/',
      linkHref: '/about',
      beforeText: 'Ember & Slice',
      afterText: 'Ember',
      forbiddenTexts: [],
    })
  })

  test('Home -> Experiences', async ({ page }) => {
    await navigateAndAssertNonBlocking(page, {
      fromPath: '/',
      linkHref: '/experiences',
      beforeText: 'Ember & Slice',
      afterText: 'Pizza Making Class',
      forbiddenTexts: ['No experiences yet.'],
    })
  })

  test('Experiences -> Experience detail', async ({ page }) => {
    await navigateAndAssertNonBlocking(page, {
      fromPath: '/experiences',
      linkHref: '/experiences/pizza-making-class',
      beforeText: 'Pizza Making Class',
      afterText: 'Stretch dough',
      forbiddenTexts: ['No experience details yet.'],
    })
  })

  test('Home -> Menu', async ({ page }) => {
    await navigateAndAssertNonBlocking(page, {
      fromPath: '/',
      linkHref: '/menu',
      beforeText: 'Ember & Slice',
      afterText: 'Menu',
      forbiddenTexts: ['No menu items.'],
    })
  })

  test('Home -> Locations', async ({ page }) => {
    await navigateAndAssertNonBlocking(page, {
      fromPath: '/',
      linkHref: '/locations',
      beforeText: 'Ember & Slice',
      afterText: 'Locations',
      forbiddenTexts: ['No locations.'],
    })
  })

  test('Locations -> Location detail', async ({ page }) => {
    await navigateAndAssertNonBlocking(page, {
      fromPath: '/locations',
      linkHref: '/locations/brooklyn',
      beforeText: 'Locations',
      afterText: 'Ember & Slice Brooklyn',
      forbiddenTexts: ['No location details.'],
    })
  })

  test('Home -> Photos does not show the empty-state fallback while loading', async ({ page }) => {
    // This is the exact scenario that reproduced #436: home's own bootstrap
    // payload has an empty photosList (only populated when the /photos page
    // requests it), so a broken pending signal would render the Saya
    // "No photos yet." empty state using home's leftover data.
    await navigateAndAssertNonBlocking(page, {
      fromPath: '/',
      linkHref: '/photos',
      beforeText: 'Ember & Slice',
      afterText: 'Photos from every room.',
      forbiddenTexts: ['No photos yet.'],
    })
  })
})
