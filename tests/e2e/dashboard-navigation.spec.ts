import { expect, test, type Page } from '@playwright/test'
import { openTenantPage } from './helpers'
import { loginAs } from './helpers/auth'

const organizationBase = '/dashboard/kikuzuki-krabi-thailand'
const siteBase = `${organizationBase}/sites/kikuzuki-krabi-thailand`
const locationBase = `${siteBase}/locations/kikuzuki-japanese-robatayaki-izakaya`

function visiblePrimaryNavigation(page: Page) {
  return page.getByRole('navigation', { name: 'Primary navigation' })
}

async function expectPrimaryOrder(page: Page) {
  await expect.poll(async () => {
    const labels = await visiblePrimaryNavigation(page).getByRole('link').allTextContents()
    return labels.map(label => label.trim())
  }).toEqual(['Home', 'Calendar', 'Website', 'Inbox'])
}

async function followPrimaryRoute(page: Page, start: string, label: string, expected: string) {
  await page.goto(start)
  await expectPrimaryOrder(page)
  await visiblePrimaryNavigation(page).getByRole('link', { name: label, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${expected}$`))
}

test.describe('authenticated dashboard navigation', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await loginAs(page.context().request, baseURL!, 'user-e2e-kikuzuki-owner')
  })

  test('keeps contextual targets and active state exclusive on desktop', async ({ page, baseURL }) => {
    await openTenantPage(page, new URL(organizationBase, baseURL!).toString(), {})
    await expectPrimaryOrder(page)
    await expect(page.getByRole('link', { name: /Back to/ })).toHaveCount(0)
    await expect(visiblePrimaryNavigation(page).locator('[aria-current="page"]')).toHaveCount(1)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')

    await followPrimaryRoute(page, organizationBase, 'Calendar', `${organizationBase}/calendar`)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page')
    await followPrimaryRoute(page, organizationBase, 'Website', `${organizationBase}/sites`)
    await followPrimaryRoute(page, organizationBase, 'Inbox', `${organizationBase}/inbox`)
    await followPrimaryRoute(page, `${organizationBase}/calendar`, 'Home', organizationBase)

    await page.goto(siteBase)
    const backToWebsite = page.getByRole('link', { name: 'Back to Website' })
    await expect(backToWebsite).toHaveAttribute('href', `${organizationBase}/sites`)
    await backToWebsite.click()
    await expect(page).toHaveURL(new RegExp(`${organizationBase}/sites$`))
    await page.goto(siteBase)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('href', siteBase)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Inbox', exact: true })).toHaveAttribute('href', `${siteBase}/inbox`)

    await page.goto(`${siteBase}/inbox`)
    await expect(visiblePrimaryNavigation(page).locator('[aria-current="page"]')).toHaveCount(1)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Inbox', exact: true })).toHaveAttribute('aria-current', 'page')

    await page.goto(locationBase)
    const desktopBack = page.getByRole('link', { name: 'Back to Site overview' })
    await expect(desktopBack).toBeVisible()
    await expect(desktopBack).toHaveAttribute('href', siteBase)
    await expect(page.getByRole('button', {
      name: 'Switch context. Current context: Kikuzuki Japanese Robatayaki & Izakaya',
    })).toBeVisible()
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('href', siteBase)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Inbox', exact: true })).toHaveAttribute('href', `${locationBase}/inbox`)

    await page.getByRole('tab', { name: 'Content', exact: true }).click()
    await expect(page.getByTestId('manager-preview-products')).toContainText(/Tuna Sushi/i)
    await expect(page.getByTestId('manager-preview-product-count')).toHaveText(/\d+ items?/)
    await expect(page.getByTestId('manager-preview-photos').locator('img')).toBeVisible()
    for (const manager of ['posts', 'qa', 'reservations']) {
      await expect(page.getByTestId(`manager-preview-${manager}`).locator('p, dl, article').first()).toBeVisible()
    }
    await expect(page.getByRole('link', { name: /Blog posts/ })).toHaveCount(0)

    await page.getByRole('link', { name: /Photos/ }).click()
    await expect(page).toHaveURL(new RegExp(`${locationBase}/photos$`))
    const backToLocation = page.getByRole('link', { name: 'Back to Location overview' })
    await expect(backToLocation).toHaveAttribute('href', locationBase)
    await backToLocation.click()
    await expect(page).toHaveURL(new RegExp(`${locationBase}$`))

    await page.goto(siteBase)
    await page.getByRole('tab', { name: 'Website', exact: true }).click()
    await expect(page.getByRole('link', { name: /Blog posts/ })).toBeVisible()
    await expect(page.getByTestId('manager-preview-media').locator('img').first()).toBeVisible()
    for (const manager of ['blog', 'testimonials', 'qa', 'ordering']) {
      await expect(page.getByTestId(`manager-preview-${manager}`).locator('p, dl, blockquote').first()).toBeVisible()
    }
    await expect(page.getByRole('link', { name: /Photos/ })).toHaveCount(0)

    await page.getByRole('link', { name: /Blog posts/ }).click()
    await expect(page).toHaveURL(new RegExp(`${siteBase}/blog$`))
    const backToSiteOverview = page.getByRole('link', { name: 'Back to Site overview' })
    await expect(backToSiteOverview).toHaveAttribute('href', siteBase)
    await backToSiteOverview.click()
    await expect(page).toHaveURL(new RegExp(`${siteBase}$`))
    await page.getByRole('tab', { name: 'Website', exact: true }).click()

    const tabs = page.getByRole('tablist')
    const previewAction = page.getByRole('link', { name: 'View site' })
    const [tabsBox, previewBox] = await Promise.all([tabs.boundingBox(), previewAction.boundingBox()])
    expect(tabsBox && previewBox && previewBox.y >= tabsBox.y + tabsBox.height).toBe(true)

    await page.getByTestId('dashboard-account-menu-button').click()
    await page.getByRole('menuitem', { name: 'Profile' }).click()
    await expect(page).toHaveURL(/\/dashboard\/account\/profile(?:\?.*)?$/)
  })

  test('renders the same primary order with a separate mobile Menu', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openTenantPage(page, new URL(locationBase, baseURL!).toString(), {})

    await expectPrimaryOrder(page)
    const navigation = visiblePrimaryNavigation(page)
    await expect(navigation.getByRole('button', { name: 'Open dashboard menu' })).toHaveText(/Menu/)
    await expect(page.getByRole('button', { name: /Switch context/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open sidebar' })).toHaveCount(0)

    const searchButton = page.getByRole('button', { name: /Search dashboard/ })
    await expect(searchButton).toBeVisible()
    await searchButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(searchButton).toBeFocused()
    await page.keyboard.press('Tab')
    const focusStyle = await page.evaluate(() => {
      const activeElement = document.activeElement
      if (!(activeElement instanceof HTMLElement)) return null
      const style = getComputedStyle(activeElement)
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow }
    })
    expect(focusStyle).not.toBeNull()
    expect(focusStyle?.outlineStyle !== 'none' || focusStyle?.outlineWidth !== '0px' || focusStyle?.boxShadow !== 'none').toBe(true)

    const initialBackBox = await page.getByRole('link', { name: 'Back to Site overview' }).boundingBox()
    expect(initialBackBox?.width).toBeGreaterThanOrEqual(44)
    expect(initialBackBox?.height).toBeGreaterThanOrEqual(44)

    await followPrimaryRoute(page, locationBase, 'Home', organizationBase)
    await followPrimaryRoute(page, locationBase, 'Calendar', `${organizationBase}/calendar`)
    await followPrimaryRoute(page, locationBase, 'Website', siteBase)
    await followPrimaryRoute(page, locationBase, 'Inbox', `${locationBase}/inbox`)
    await page.goto(locationBase)

    const backToSite = page.getByRole('link', { name: 'Back to Site overview' })
    await expect(backToSite).toBeVisible()
    await backToSite.click()
    await expect(page).toHaveURL(new RegExp(`${siteBase}$`))
    const siteSettingsBox = await page.getByRole('link', { name: 'Site settings' }).boundingBox()
    expect(siteSettingsBox?.width).toBeGreaterThanOrEqual(44)
    expect(siteSettingsBox?.height).toBeGreaterThanOrEqual(44)
    await page.goto(locationBase)

    for (const target of await navigation.getByRole('link').all()) {
      const box = await target.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
    const menuBox = await navigation.getByRole('button', { name: 'Open dashboard menu' }).boundingBox()
    expect(menuBox?.width).toBeGreaterThanOrEqual(44)
    expect(menuBox?.height).toBeGreaterThanOrEqual(44)

    await navigation.getByRole('button', { name: 'Open dashboard menu' }).click()
    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Authentication' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Assistant' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Analytics' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Domains' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Site settings' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Organization settings' })).toBeVisible()

    const layoutMetrics = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>('.dashboard-shell-content')
      const nav = document.querySelector<HTMLElement>('.dashboard-mobile-navigation')
      return {
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        contentPaddingBottom: content ? Number.parseFloat(getComputedStyle(content).paddingBottom) : 0,
        navigationHeight: nav?.getBoundingClientRect().height ?? 0,
      }
    })
    expect(layoutMetrics.noHorizontalOverflow).toBe(true)
    expect(layoutMetrics.contentPaddingBottom).toBeGreaterThanOrEqual(layoutMetrics.navigationHeight)

    await page.getByRole('menuitem', { name: 'Profile' }).click()
    await expect(page).toHaveURL(/\/dashboard\/account\/profile(?:\?.*)?$/)
  })
})

test.describe('site manager previews', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await loginAs(page.context().request, baseURL!, 'user-e2e-ncls-owner')
  })

  test('renders seeded site content through the production worker', async ({ page, baseURL }) => {
    await openTenantPage(page, new URL('/dashboard/north-carolina-legal-services/sites/ncls', baseURL!).toString(), {})
    await page.getByRole('tab', { name: 'Website', exact: true }).click()

    await expect(page.getByTestId('manager-preview-blog')).toContainText('IEP Violations in North Carolina')
    await expect(page.getByTestId('manager-preview-testimonials')).toContainText('Jonathan Matthews')
    await expect(page.getByTestId('manager-preview-qa')).toContainText('Why should I hire an attorney?')
    await expect(page.getByTestId('manager-preview-services')).toContainText('Family law')
  })
})
