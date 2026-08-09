// Regression coverage for krabiclaw #436/#437: client-side navigation on a
// tenant Saya site must never render another page's (or an empty-state)
// content while its own page fetch is still in flight. See
// composables/usePublicPageData.ts and composables/useSiteShell.ts for the fix.
//
// The page XHR is deliberately delayed via route interception so the
// race window is wide enough to observe deterministically — on unthrottled
// local/CI networks the fetch can resolve fast enough that a regression
// wouldn't reliably show up otherwise.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  collectPageErrors,
  tenantBaseURL,
  tenantExtraHeaders,
  setupTenantHeaders,
} from './helpers'

const expectNoHydrationOrScopeErrors = (errors: string[]) => {
  expect(errors.filter(error =>
    error.includes('Hydration')
    || error.includes('onScopeDispose()')
    || error.includes('onMounted is called')
    || error.includes('onBeforeUnmount is called'),
  )).toEqual([])
}

async function setupNavigationTest(page: Page) {
  // This suite validates live loader transitions. Persistent Miniflare HTML
  // cache can otherwise replay an SSR document from an earlier test run and
  // prevent the browser from exercising the current loader implementation.
  await page.setExtraHTTPHeaders({ 'cache-control': 'no-cache' })

  // Defeat NuxtLink's viewport-based prefetch so the page fetch only
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

async function navigateAndAssertAuthoritative(page: Page, opts: {
  fromPath: string
  linkHref: string
  beforeText: string
  afterText: string
  forbiddenTexts: string[]
}) {
  const errors = collectPageErrors(page)
  let releasePageRequest!: () => void
  const pageRequestPaused = new Promise<void>((resolve) => {
    releasePageRequest = resolve
  })
  let markPageRequestPaused!: () => void
  const sawPausedPageRequest = new Promise<void>((resolve) => {
    markPageRequestPaused = resolve
  })
  await page.route('**/api/public/sites/*/page*', async (route) => {
    const url = new URL(route.request().url())
    const destinationSegments = opts.linkHref.split('/').filter(Boolean)
    const expectedPage = destinationSegments[0] === 'locations' && destinationSegments[1]
      ? 'location'
      : destinationSegments[0]
    const expectedSlug = destinationSegments[1]
    if (
      url.searchParams.get('page') !== expectedPage
      || (expectedSlug && ![url.searchParams.get('experience'), url.searchParams.get('location')].includes(expectedSlug))
    ) {
      await route.continue()
      return
    }
    markPageRequestPaused()
    await pageRequestPaused
    await route.continue()
  })

  await page.goto(`${tenantBaseURL}${opts.fromPath}`, { waitUntil: 'load' })
  await expect(page.locator('body')).toContainText(opts.beforeText)
  const link = page.locator(`a[href="${opts.linkHref}"]`).first()
  await page.waitForFunction(
    href => Boolean(
      (document.querySelector(`a[href="${href}"]`) as Element & { __vueParentComponent?: unknown } | null)
        ?.__vueParentComponent,
    ),
    opts.linkHref,
  )
  // Dispatch the click without Playwright waiting for navigation completion;
  // the behavior under test is specifically the state before data completes.
  await link.evaluate((element: HTMLAnchorElement) => element.click())
  await sawPausedPageRequest

  // The destination request is authoritative. Nuxt retains the current route
  // until it succeeds instead of mounting the destination with empty data.
  await expect(page).toHaveURL(new RegExp(`${opts.linkHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
  for (const forbidden of opts.forbiddenTexts) {
    await expect(page.locator('main')).not.toContainText(forbidden)
  }

  releasePageRequest()
  await expect(page.locator('main[data-route-shell]')).toHaveAttribute('data-route-shell', opts.linkHref)
  await expect(page.locator('body')).toContainText(opts.afterText)
  expectNoHydrationOrScopeErrors(errors)
}

test.describe('tenant client-side navigation does not show stale/fallback content', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, tenantBaseURL, tenantExtraHeaders)
    await setupNavigationTest(page)
  })

  test('Home -> Experiences', async ({ page }) => {
    await navigateAndAssertAuthoritative(page, {
      fromPath: '/',
      linkHref: '/experiences',
      beforeText: 'Ember & Slice',
      afterText: 'Pizza Making Class',
      forbiddenTexts: ['No experiences yet.'],
    })
  })

  test('Home -> Menu', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(`${tenantBaseURL}/`, { waitUntil: 'load' })
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.includes('/api/public/sites/')
        && url.pathname.endsWith('/page')
        && url.searchParams.get('page') === 'menu'
    })

    await page.locator('a[href="/menu"]').first().evaluate(
      (element: HTMLAnchorElement) => element.click(),
    )

    const response = await responsePromise
    expect(response.ok()).toBe(true)
    await expect(page).toHaveURL(/\/menu\/?$/)
    await expect(page.locator('main')).toContainText('Margherita')
    await expect(page.locator('main')).not.toContainText('Menu coming soon.')
    expectNoHydrationOrScopeErrors(errors)
  })

  for (const destination of [
    { path: '/reviews', page: 'reviews', text: 'Reviews' },
    { path: '/qa', page: 'qa', text: 'Frequently' },
    { path: '/posts', page: 'posts', text: 'Updates' },
    { path: '/photos', page: 'photos', text: 'Gallery' },
  ]) {
    test(`Home -> ${destination.path}`, async ({ page }) => {
      const errors = collectPageErrors(page)
      await page.goto(`${tenantBaseURL}/`, { waitUntil: 'load' })
      const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return url.pathname.includes('/api/public/sites/')
          && url.pathname.endsWith('/page')
          && url.searchParams.get('page') === destination.page
      })

      await page.locator(`a[href="${destination.path}"]`).last().evaluate(
        (element: HTMLAnchorElement) => element.click(),
      )

      expect((await responsePromise).ok()).toBe(true)
      await expect(page).toHaveURL(new RegExp(`${destination.path}/?$`))
      await expect(page.locator('main')).toContainText(destination.text)
      await expect(page.locator('main')).not.toBeEmpty()
      expectNoHydrationOrScopeErrors(errors)
    })
  }

  test('page API failure reaches the Nuxt error boundary', async ({ page }) => {
    await page.goto(`${tenantBaseURL}/`, { waitUntil: 'load' })
    await page.route('**/api/public/sites/*/page*', async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('page') !== 'menu') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 503, statusMessage: 'Unavailable' }),
      })
    })

    await page.locator('a[href="/menu"]').first().evaluate(
      (element: HTMLAnchorElement) => element.click(),
    )

    await expect(page).toHaveURL(/\/menu\/?$/)
    await expect(page.locator('body')).toContainText('Something went wrong')
    await expect(page.locator('body')).not.toContainText('Menu coming soon.')
  })

  test('Experiences -> Experience detail', async ({ page }) => {
    await navigateAndAssertAuthoritative(page, {
      fromPath: '/experiences',
      linkHref: '/experiences/pizza-making-class',
      beforeText: 'Pizza Making Class',
      afterText: 'Stretch dough',
      forbiddenTexts: ['No experience details yet.'],
    })
  })

  test('Home -> Locations', async ({ page }) => {
    await navigateAndAssertAuthoritative(page, {
      fromPath: '/',
      linkHref: '/locations',
      beforeText: 'Ember & Slice',
      afterText: 'Locations',
      forbiddenTexts: ['No locations.'],
    })
  })

  test('Locations -> Location detail', async ({ page }) => {
    await navigateAndAssertAuthoritative(page, {
      fromPath: '/locations',
      linkHref: '/locations/brooklyn',
      beforeText: 'Locations',
      afterText: 'Ember & Slice Brooklyn',
      forbiddenTexts: ['No location details.'],
    })
  })

  test('Location detail -> Location reviews', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(`${tenantBaseURL}/locations/brooklyn`, { waitUntil: 'load' })
    await expect(page.locator('main')).toContainText('Weekend lunch now starts')

    await page.locator('main a[href="/locations/brooklyn/reviews"]').evaluate(
      (element: HTMLAnchorElement) => element.click(),
    )

    await expect(page).toHaveURL(/\/locations\/brooklyn\/reviews\/?$/)
    await expect(page.locator('main')).toContainText('What guests are saying')
    expectNoHydrationOrScopeErrors(errors)
  })

  test('Menu -> Menu item detail', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(`${tenantBaseURL}/menu`, { waitUntil: 'load' })
    await expect(page.locator('body')).toContainText('Margherita')

    const link = page.locator('a[href="/menu/margherita"]').first()
    await link.evaluate((element: HTMLAnchorElement) => element.click())

    await expect(page).toHaveURL(/\/menu\/margherita\/?$/)
    await expect(page.locator('main')).toContainText('Margherita')
    await expect(page.locator('[data-testid="error-page"]')).toHaveCount(0)
    expectNoHydrationOrScopeErrors(errors)
  })

})
