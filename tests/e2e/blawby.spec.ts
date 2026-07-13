import { expect, test } from '@playwright/test'
import { blawbyBaseURL, blawbyExtraHeaders, collectPageErrors, expectHealthyPage, setupTenantHeaders } from './helpers'

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.locator('.blawby-shell[data-hydrated="true"]').waitFor()
}

const routes: ReadonlyArray<readonly [string, RegExp]> = [
  ['/', /Access to Justice for All\./i],
  ['/services', /Our Services/i],
  ['/services/family', /Family law/i],
  ['/about', /About Us/i],
  ['/pricing', /Affordable, for everyone/i],
  ['/contact', /Contact Us/i],
  ['/contact/confirmed', /Message received/i],
  ['/schedule', /Request a Legal Consultation/i],
  ['/blog', /Our Blog/i],
  ['/article/getting-a-divorce-in-north-carolina', /Getting a Divorce in North Carolina/i],
  ['/donate', /Support Equal Access to Justice/i],
  ['/policies/privacy', /Privacy Policy/i],
  ['/policies/terms', /Terms of Use/i],
  ['/third-party-notices', /Third-Party Notices/i],
] as const

const legacyRedirects = [
  ['/article/divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare', '/article/divorce-and-children-in-north-carolina'],
  ['/article/preparing-for-your-consultation', '/article/preparing-for-your-consultation-with-north-carolina-legal-services'],
  ['/article/property-division-in-north-carolina-divorce', '/article/property-division-in-north-carolina-divorce-protecting-whats-yours'],
  ['/article/writing-your-own-will-how-it-works-in-north-carolina', '/article/writing-your-own-will-how-it-works'],
] as const

test.describe('Blawby NCLS public site', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, blawbyBaseURL, blawbyExtraHeaders)
  })

  for (const [path, expectedHeading] of routes) {
    test(`${path} renders scoped SSR without runtime errors`, async ({ page }) => {
      const errors = collectPageErrors(page)
      const response = await page.goto(`${blawbyBaseURL}${path}`, { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(400)
      await waitForHydration(page)
      await expect(page.getByRole('heading', { name: expectedHeading }).first()).toBeVisible()
      await expect(page.locator('header').getByRole('link', { name: 'Get Started', exact: true }).first()).toBeVisible()
      await expect(page.locator('footer')).toContainText('North Carolina Legal Services')
      await expectHealthyPage(page, errors)
    })
  }

  for (const [from, to] of legacyRedirects) {
    test(`${from} preserves the source URL with a permanent redirect`, async ({ request }) => {
      const response = await request.get(`${blawbyBaseURL}${from}`, {
        headers: blawbyExtraHeaders,
        maxRedirects: 0,
      })
      expect(response.status()).toBe(301)
      expect(response.headers().location).toBe(to)
    })
  }

  test('services payload excludes full bodies and unrelated pages', async ({ request }) => {
    const response = await request.get(`${blawbyBaseURL}/api/public/sites/site-ncls-blawby/blawby/route`, {
      headers: blawbyExtraHeaders,
      params: { recipe: 'services' },
    })
    expect(response.ok()).toBe(true)
    const payload = await response.json()
    expect(payload.recipe).toBe('services')
    expect(payload.page.path).toBe('/services')
    expect(payload.offerings.length).toBeGreaterThan(0)
    expect(payload.offerings[0]).not.toHaveProperty('body')
    expect(payload).not.toHaveProperty('tenantPages')
    expect(payload.posts).toEqual([])
    expect(payload.reviews).toEqual([])
    expect(payload.post).toBeNull()
  })

  test('article payload contains one full post and summary-only related posts', async ({ request }) => {
    const response = await request.get(`${blawbyBaseURL}/api/public/sites/site-ncls-blawby/blawby/route`, {
      headers: blawbyExtraHeaders,
      params: { recipe: 'article', slug: 'preparing-for-your-consultation-with-north-carolina-legal-services' },
    })
    expect(response.ok()).toBe(true)
    const payload = await response.json()
    expect(payload.post.slug).toBe('preparing-for-your-consultation-with-north-carolina-legal-services')
    expect(payload.post.body.length).toBeGreaterThan(0)
    expect(payload.posts.length).toBeGreaterThan(0)
    expect(payload.post.tags).toContain('Consultation')
    expect(payload.posts.every((post: Record<string, unknown>) => !('body' in post))).toBe(true)
    expect(payload.offerings).toEqual([])
    expect(payload.page.path).toBe('/blog')
  })

  test('service cards use the deployed full-width image treatment', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/services`, { waitUntil: 'load' })
    const card = page.locator('[data-parity-section="services"] a').first()
    const image = card.locator('img').first()
    const [cardBox, imageBox] = await Promise.all([card.boundingBox(), image.boundingBox()])
    expect(cardBox).not.toBeNull()
    expect(imageBox).not.toBeNull()
    expect(imageBox!.width / cardBox!.width).toBeGreaterThan(0.8)
  })

  test('article body media and related articles render successfully', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/article/preparing-for-your-consultation-with-north-carolina-legal-services`, { waitUntil: 'load' })
    await expect(page.locator('[data-parity-section="related-articles"]')).toBeVisible()
    await expect.poll(() => page.locator('[data-parity-section="article-content"] img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length)).toBe(0)
  })

  test('mobile routes do not overflow and expose the source section order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 })
    await page.goto(`${blawbyBaseURL}/`, { waitUntil: 'load' })
    await waitForHydration(page)
    const order = await page.locator('[data-parity-root] > [data-parity-section]').evaluateAll(elements => elements.map(element => element.getAttribute('data-parity-section')))
    expect(order).toEqual(['hero', 'services', 'approach', 'qa', 'reviews', 'articles', 'articles-more', 'consultation'])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const menu = page.getByRole('button', { name: 'Toggle navigation' })
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#blawby-mobile-nav')).toContainText('Services')
  })

  test('pricing calculator follows imported threshold boundaries', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/pricing`, { waitUntil: 'load' })
    const income = page.getByLabel('Household Income')
    await income.fill('39900')
    await expect(page.getByText('$160/hr', { exact: true })).toBeVisible()
    await income.fill('63841')
    await expect(page.getByText('$320/hr', { exact: true })).toBeVisible()
  })

  test('service feature tabs support arrow-key navigation', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/services/family`, { waitUntil: 'load' })
    const featureTabs = page.getByRole('tablist', { name: 'Service features' })
    const tabs = featureTabs.getByRole('tab')
    expect(await tabs.count()).toBeGreaterThan(1)
    const selected = featureTabs.locator('[role="tab"][aria-selected="true"]')
    expect(await selected.count()).toBe(1)
    await selected.press('ArrowRight')
    await expect(featureTabs.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute('tabindex', '0')
  })

  test('blog taxonomy filter changes the visible article set', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/blog`, { waitUntil: 'load' })
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Divorce', exact: true }).click()
    await expect(page.locator('[data-parity-section="articles"] article')).toHaveCount(1)
  })

  test('professional contact requires explicit consent', async ({ request }) => {
    const response = await request.post(`${blawbyBaseURL}/api/public/sites/site-ncls-blawby/contact`, {
      headers: blawbyExtraHeaders,
      data: { name: 'Test Client', email: 'client@example.test', subject: 'general', message: 'This is a valid test message.' },
    })
    expect(response.status()).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('acknowledge') })
  })

  test('contact page preserves source form parity and confirmation remains noindex', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/contact`, { waitUntil: 'load' })
    await waitForHydration(page)
    await expect(page.locator('[data-parity-section="contact"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send message' })).toHaveCount(0)

    await page.goto(`${blawbyBaseURL}/contact/confirmed`, { waitUntil: 'load' })
    await expect(page.getByRole('heading', { name: 'Message received' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  test('all imported media references use approved hosts', async ({ request }) => {
    const response = await request.get(`${blawbyBaseURL}/api/public/sites/site-ncls-blawby/blawby/route`, {
      headers: blawbyExtraHeaders,
      params: { recipe: 'home' },
    })
    const payload = await response.json()
    const urls: string[] = []
    const collectUrls = (value: unknown) => {
      if (typeof value === 'string' && /^https?:\/\//.test(value)) urls.push(value)
      else if (Array.isArray(value)) value.forEach(collectUrls)
      else if (value && typeof value === 'object') Object.values(value).forEach(collectUrls)
    }
    collectUrls(payload)
    const approved = new Set(['images.krabiclaw.com', 'media.krabiclaw.com', 'imagedelivery.net'])
    const mediaUrls = [...new Set(urls.filter(url => approved.has(new URL(url).hostname)))]
    expect(mediaUrls.length).toBeGreaterThan(0)
    for (const url of mediaUrls) {
      expect(approved.has(new URL(url).hostname)).toBe(true)
      const mediaResponse = await request.get(url)
      expect(mediaResponse.status(), url).toBeLessThan(400)
    }
  })
})
