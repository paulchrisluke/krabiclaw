import { expect, test } from '@playwright/test'
import { blawbyBaseURL, blawbyExtraHeaders, collectPageErrors, expectHealthyPage, setupTenantHeaders } from './helpers'

const routes = [
  ['/', 'Access to Justice for All.'],
  ['/services', 'Our Services'],
  ['/services/family', 'Family law'],
  ['/about', 'About Us'],
  ['/pricing', 'Affordable, for everyone'],
  ['/contact', 'Contact Us'],
  ['/contact/confirmed', 'Message received'],
  ['/schedule', 'Request a Legal Consultation'],
  ['/blog', 'Our Blog'],
  ['/article/getting-a-divorce-in-north-carolina', 'Getting a Divorce in North Carolina'],
  ['/donate', 'Support Equal Access to Justice'],
  ['/policies/privacy', 'Privacy Policy'],
  ['/policies/terms', 'Terms of Use'],
  ['/third-party-notices', 'Third-Party Notices'],
] as const

test.describe('Blawby NCLS public site', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, blawbyBaseURL, blawbyExtraHeaders)
  })

  for (const [path, expectedText] of routes) {
    test(`${path} renders scoped SSR without runtime errors`, async ({ page }) => {
      const errors = collectPageErrors(page)
      const response = await page.goto(`${blawbyBaseURL}${path}`, { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(400)
      await expect(page.locator('body')).toContainText(expectedText)
      await expect(page.locator('header')).toContainText('Schedule a consultation')
      await expect(page.locator('footer')).toContainText('North Carolina Legal Services')
      await expectHealthyPage(page, errors)
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
    expect(payload.posts.every((post: Record<string, unknown>) => !('body' in post))).toBe(true)
    expect(payload.offerings).toEqual([])
    expect(payload.page.path).toBe('/blog')
  })

  test('mobile routes do not overflow and expose the source section order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 })
    await page.goto(`${blawbyBaseURL}/`, { waitUntil: 'load' })
    const order = await page.locator('[data-parity-root] > [data-parity-section]').evaluateAll(elements => elements.map(element => element.getAttribute('data-parity-section')))
    expect(order).toEqual(['hero', 'services', 'approach', 'qa', 'reviews', 'articles', 'consultation'])
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
    const tabs = page.getByRole('tab')
    expect(await tabs.count()).toBeGreaterThan(1)
    const selected = page.locator('[role="tab"][aria-selected="true"]')
    expect(await selected.count()).toBe(1)
    await selected.press('ArrowRight')
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute('tabindex', '0')
  })

  test('blog taxonomy filter changes the visible article set', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/blog`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Category', exact: true }).click()
    const filter = page.getByRole('checkbox', { name: 'Employee Rights', exact: true })
    await filter.check()
    await expect(page).toHaveURL(/tags%5B%5D=Employee(\+|%20)Rights/)
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

  test('contact consent submits through the native noindex confirmation flow', async ({ page }) => {
    await page.goto(`${blawbyBaseURL}/contact`, { waitUntil: 'load' })
    await page.getByLabel('Name').fill('Blawby Test Client')
    await page.getByLabel('Email').fill(`blawby-${Date.now()}@example.test`)
    await page.getByLabel('Message').fill('Please contact me about a legal services consultation.')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page).toHaveURL(/\/contact\/confirmed$/)
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
