import { expect, test, type Page } from '@playwright/test'
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

test.describe('authenticated dashboard navigation', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await loginAs(page.context().request, baseURL!, 'user-e2e-kikuzuki-owner')
  })

  test('keeps contextual targets and active state exclusive on desktop', async ({ page }) => {
    await page.goto(organizationBase)
    await expectPrimaryOrder(page)
    await expect(visiblePrimaryNavigation(page).locator('[aria-current="page"]')).toHaveCount(1)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')

    await visiblePrimaryNavigation(page).getByRole('link', { name: 'Calendar', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${organizationBase}/calendar$`))
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page')

    await page.goto(siteBase)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('href', siteBase)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Inbox', exact: true })).toHaveAttribute('href', `${siteBase}/inbox`)

    await page.goto(`${siteBase}/inbox`)
    await expect(visiblePrimaryNavigation(page).locator('[aria-current="page"]')).toHaveCount(1)
    await expect(visiblePrimaryNavigation(page).getByRole('link', { name: 'Inbox', exact: true })).toHaveAttribute('aria-current', 'page')

    await page.goto(locationBase)
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
    await expect(page.getByRole('link', { name: /Blog posts/ })).toHaveCount(0)

    await page.goto(siteBase)
    await page.getByRole('tab', { name: 'Website', exact: true }).click()
    await expect(page.getByRole('link', { name: /Blog posts/ })).toBeVisible()
    await expect(page.getByTestId('manager-preview-media').locator('img').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Photos/ })).toHaveCount(0)

    const tabs = page.getByRole('tablist')
    const previewAction = page.getByRole('link', { name: 'View site' })
    const [tabsBox, previewBox] = await Promise.all([tabs.boundingBox(), previewAction.boundingBox()])
    expect(tabsBox && previewBox && previewBox.y >= tabsBox.y + tabsBox.height).toBe(true)
  })

  test('renders the same primary order with a separate mobile Menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(locationBase)

    await expectPrimaryOrder(page)
    const navigation = visiblePrimaryNavigation(page)
    await expect(navigation.getByRole('button', { name: 'Open dashboard menu' })).toHaveText(/Menu/)
    await expect(page.getByRole('button', { name: /Switch context/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Search dashboard/ })).toBeVisible()
    const backToSite = page.getByRole('link', { name: 'Back to Site overview' })
    await expect(backToSite).toBeVisible()
    await backToSite.click()
    await expect(page).toHaveURL(new RegExp(`${siteBase}$`))
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
  })
})
