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

const BOOTSTRAP_DELAY_MS = 1000

async function setupSlowBootstrap(page: Page) {
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
  await page.route('**/api/public/sites/*/bootstrap*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_DELAY_MS))
    await route.continue()
  })
}

async function navigateAndAssertNoStaleFlash(page: Page, opts: {
  fromPath: string
  linkHref: string
  beforeText: string
  afterText: string
  forbiddenTexts: string[]
}) {
  await page.goto(`${tenantBaseURL}${opts.fromPath}`, { waitUntil: 'load' })
  await expect(page.locator('body')).toContainText(opts.beforeText)

  const link = page.locator(`a[href="${opts.linkHref}"]`).first()
  await link.click()

  // Poll frequently across the whole delay window — any appearance of a
  // forbidden marker (wrong page's content, or a premature empty state)
  // at any point during the transition is the bug.
  const deadline = Date.now() + BOOTSTRAP_DELAY_MS + 3000
  let sawForbidden: string | null = null
  while (Date.now() < deadline) {
    const bodyText = await page.locator('body').innerText().catch(() => '')
    for (const forbidden of opts.forbiddenTexts) {
      if (bodyText.includes(forbidden)) sawForbidden = forbidden
    }
    if (bodyText.includes(opts.afterText)) break
    await page.waitForTimeout(100)
  }

  expect(sawForbidden, `saw forbidden marker "${sawForbidden}" during ${opts.fromPath} -> ${opts.linkHref} navigation`).toBeNull()
  await expect(page.locator('body')).toContainText(opts.afterText)
}

test.describe('tenant client-side navigation does not show stale/fallback content', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, tenantBaseURL, tenantExtraHeaders)
    await setupSlowBootstrap(page)
  })

  test('Home -> About', async ({ page }) => {
    await navigateAndAssertNoStaleFlash(page, {
      fromPath: '/',
      linkHref: '/about',
      beforeText: 'Ember & Slice',
      afterText: 'Ember',
      forbiddenTexts: [],
    })
  })

  test('Home -> Experiences', async ({ page }) => {
    await navigateAndAssertNoStaleFlash(page, {
      fromPath: '/',
      linkHref: '/experiences',
      beforeText: 'Ember & Slice',
      afterText: 'Pizza Making Class',
      forbiddenTexts: [],
    })
  })

  test('Experiences -> Experience detail', async ({ page }) => {
    await navigateAndAssertNoStaleFlash(page, {
      fromPath: '/experiences',
      linkHref: '/experiences/pizza-making-class',
      beforeText: 'Pizza Making Class',
      afterText: 'Stretch dough',
      forbiddenTexts: [],
    })
  })

  test('Home -> Menu', async ({ page }) => {
    await navigateAndAssertNoStaleFlash(page, {
      fromPath: '/',
      linkHref: '/menu',
      beforeText: 'Ember & Slice',
      afterText: 'Menu',
      forbiddenTexts: [],
    })
  })

  test('Home -> Locations', async ({ page }) => {
    await navigateAndAssertNoStaleFlash(page, {
      fromPath: '/',
      linkHref: '/locations',
      beforeText: 'Ember & Slice',
      afterText: 'Locations',
      forbiddenTexts: [],
    })
  })

  test('Locations -> Location detail', async ({ page }) => {
    await navigateAndAssertNoStaleFlash(page, {
      fromPath: '/locations',
      linkHref: '/locations/brooklyn',
      beforeText: 'Locations',
      afterText: 'Ember & Slice Brooklyn',
      forbiddenTexts: [],
    })
  })

  test('Home -> Photos does not show the empty-state fallback while loading', async ({ page }) => {
    // This is the exact scenario that reproduced #436: home's own bootstrap
    // payload has an empty photosList (only populated when the /photos page
    // requests it), so a broken pending signal would render the Saya
    // "No photos yet." empty state using home's leftover data.
    await navigateAndAssertNoStaleFlash(page, {
      fromPath: '/',
      linkHref: '/photos',
      beforeText: 'Ember & Slice',
      afterText: 'Photos from every room.',
      forbiddenTexts: ['No photos yet.'],
    })
  })
})
