import { expect, test } from '@playwright/test'
import { blawbyBaseURL, blawbyExtraHeaders, collectPageErrors, expectHealthyPage, setupTenantHeaders } from './helpers'

const approvedDonationUrl = 'https://donate.stripe.com/bIY29UfAUec37GocMM'
const legacyDonationHost = 'app.blawby.com'

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.locator('.blawby-shell[data-hydrated="true"]').waitFor()
}

const longSidebarTitles = [
  '7 Common IEP Violations Every North Carolina Parent Should Recognize (And How to Fight Back)',
  'Your Landlord Cannot Evict You Without a Court Order — Here\'s What to Do When They Try',
] as const
const sidebarRegressionArticlePath = '/article/preparing-for-your-consultation-with-north-carolina-legal-services'

async function expectContainedTwoLineSidebarTitle(link: import('@playwright/test').Locator, expectedTitle: string) {
  await expect(link).not.toHaveAttribute('title', /.*/)
  const title = link.locator('[data-blog-nav-title]')
  await expect(title).toBeVisible()
  const tooltip = link.locator('[data-blog-nav-tooltip]')
  await expect(tooltip).toHaveAttribute('aria-hidden', 'true')
  await expect(tooltip).toHaveText(expectedTitle)

  const metrics = await title.evaluate((node) => {
    const titleElement = node as HTMLElement
    const linkElement = titleElement.closest('[data-blog-nav-link]') as HTMLElement
    const style = getComputedStyle(titleElement)
    const titleRect = titleElement.getBoundingClientRect()
    const linkRect = linkElement.getBoundingClientRect()
    return {
      lineClamp: style.getPropertyValue('-webkit-line-clamp'),
      overflow: style.overflow,
      lineHeight: Number.parseFloat(style.lineHeight),
      titleHeight: titleRect.height,
      titleBottom: titleRect.bottom,
      linkBottom: linkRect.bottom,
      linkScrollWidth: linkElement.scrollWidth,
      linkClientWidth: linkElement.clientWidth,
      titleScrollWidth: titleElement.scrollWidth,
      titleClientWidth: titleElement.clientWidth,
    }
  })

  expect(metrics.lineClamp).toBe('2')
  expect(metrics.overflow).toBe('hidden')
  expect(metrics.titleHeight).toBeLessThanOrEqual(Math.ceil(metrics.lineHeight * 2) + 1)
  expect(metrics.titleBottom).toBeLessThanOrEqual(metrics.linkBottom + 1)
  expect(metrics.linkScrollWidth - metrics.linkClientWidth).toBeLessThanOrEqual(1)
  expect(metrics.titleScrollWidth - metrics.titleClientWidth).toBeLessThanOrEqual(1)
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

  test('donation page uses the approved Stripe destination for buttons and schema', async ({ page, context }) => {
    await context.route(`${approvedDonationUrl}**`, route => route.fulfill({ status: 204, body: '' }))
    await page.goto(`${blawbyBaseURL}/donate`, { waitUntil: 'load' })
    await waitForHydration(page)

    expect(page.url()).toBe(`${blawbyBaseURL}/donate`)
    const donationLinks = page.getByRole('link', { name: /^Donate / })
    await expect(donationLinks).toHaveCount(2)
    await expect.poll(() => donationLinks.evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href))).toEqual([
      approvedDonationUrl,
      approvedDonationUrl,
    ])
    await expect(page.locator('body')).not.toContainText(legacyDonationHost)

    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    const schemaText = JSON.stringify(jsonLd.map((entry) => JSON.parse(entry)))
    expect(schemaText).toContain(`"target":"${approvedDonationUrl}"`)
    expect(schemaText).not.toContain(legacyDonationHost)

    const clickedButton = donationLinks.first()
    await clickedButton.evaluate((link) => {
      link.addEventListener('click', (event) => {
        const browserWindow = window as Window & {
          __nclsDonationClick?: {
            defaultPrevented: boolean
            href: string
            rel: string
            target: string
          }
        }
        browserWindow.__nclsDonationClick = {
          defaultPrevented: event.defaultPrevented,
          href: (link as HTMLAnchorElement).href,
          rel: (link as HTMLAnchorElement).rel,
          target: (link as HTMLAnchorElement).target,
        }
      }, { once: true, capture: true })
    })
    await clickedButton.click()
    await expect.poll(() => page.evaluate(() => {
      return (window as Window & {
        __nclsDonationClick?: {
          defaultPrevented: boolean
          href: string
          rel: string
          target: string
        }
      }).__nclsDonationClick ?? null
    })).toEqual({
      defaultPrevented: false,
      href: approvedDonationUrl,
      rel: 'noopener noreferrer',
      target: '_blank',
    })
  })

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
    const relatedArticles = page.locator('[data-parity-section="related-articles"]')
    await expect(relatedArticles).toBeVisible()
    await relatedArticles.scrollIntoViewIfNeeded()
    const relatedImages = relatedArticles.locator('img')
    await expect.poll(() => relatedImages.count()).toBeGreaterThan(0)
    await expect.poll(() => relatedImages.evaluateAll(images => images.filter(image => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length)).toBe(0)
  })

  test('article sidebar clamps long titles inside the desktop column', async ({ page }) => {
    for (const width of [1024, 1600]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${blawbyBaseURL}${sidebarRegressionArticlePath}`, { waitUntil: 'load' })
      await waitForHydration(page)

      const sidebar = page.locator('aside').getByRole('navigation', { name: 'Blog posts by category' })
      await expect(sidebar).toBeVisible()
      await expect(sidebar).toHaveCSS('width', '240px')

      for (const title of longSidebarTitles) {
        await expectContainedTwoLineSidebarTitle(sidebar.getByRole('link', { name: title, exact: true }), title)
      }

      const keyboardLink = sidebar.getByRole('link', { name: longSidebarTitles[1], exact: true })
      await keyboardLink.focus()
      await expect(keyboardLink).toBeFocused()
      await expect(keyboardLink.locator('[data-blog-nav-tooltip]')).toBeVisible()
    }
  })

  test('mobile article topic drawer clamps long titles without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.goto(`${blawbyBaseURL}${sidebarRegressionArticlePath}`, { waitUntil: 'load' })
    await waitForHydration(page)

    await page.getByRole('button', { name: 'Browse topics' }).click()
    const drawer = page.getByRole('dialog', { name: 'Browse topics' })
    await expect(drawer).toBeVisible()

    const nav = drawer.getByRole('navigation', { name: 'Blog posts by category' })
    for (const title of longSidebarTitles) {
      await expectContainedTwoLineSidebarTitle(nav.getByRole('link', { name: title, exact: true }), title)
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
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
    await waitForHydration(page)
    const income = page.getByLabel('Household Income')
    const displayedRate = page.getByText('Your Rate', { exact: true }).locator('..')
    await income.fill('39900')
    await expect(displayedRate.getByText('$160/hr', { exact: true })).toBeVisible()
    await income.fill('63841')
    await expect(displayedRate.getByText('$320/hr', { exact: true })).toBeVisible()
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
    await expect(page.locator('[data-parity-section="articles"]').getByRole('link')).toHaveCount(2)
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
      const mediaResponse = await request.get(url, { headers: { Range: 'bytes=0-0' } })
      expect(mediaResponse.status(), url).toBeLessThan(400)
    }
  })
})
