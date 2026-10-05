import { expect, test, type Page } from '@playwright/test'
import { dismissPreviewToolbar, waitForNuxtHydration } from './helpers'
import { loginAs } from './helpers/auth'
import { isAccountActivityResponse, isAccountActivityDetailResponse } from '../../shared/account-activity'

// The dashboard's pane topology is the nested route tree (DESIGN.md, Route
// hierarchy). On a wide screen a level renders beside the parent its Back goes
// to, an index of deterministic settings opens its first one, and a list of
// records opens nothing. Below `lg` every level is one screen.

const ORG = '/dashboard/ember-slice-demo'
const WIDE = { width: 1440, height: 900 }
const NARROW = { width: 900, height: 900 }

/** The panes on screen, left to right, by the id each DashboardIndexPanel/LeafPanel is given. */
async function visiblePanes(page: Page): Promise<string[]> {
  return page.locator('[id^="dashboard-panel-"]').evaluateAll(elements => elements
    .filter(element => element.getBoundingClientRect().width > 0)
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    .map(element => element.id.replace('dashboard-panel-', '')))
}

async function expectPanes(page: Page, panes: string[]) {
  await expect.poll(() => visiblePanes(page)).toEqual(panes)
}

async function open(page: Page, path: string) {
  const response = await page.goto(path)
  expect(response?.status()).toBe(200)
  await waitForNuxtHydration(page)
}

test.describe('dashboard pane hierarchy', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await dismissPreviewToolbar(page)
    await loginAs(page.request, baseURL!)
  })

  test('Menu rows keep their URLs and nest under Menu in the matched route tree', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await open(page, `${ORG}/settings`)
    const resolved = await page.evaluate((org) => {
      const router = (document.querySelector('#__nuxt') as Element & {
        __vue_app__: { config: { globalProperties: { $router: { resolve: (path: string) => { path: string; matched: Array<{ path: string }> } } } } }
      }).__vue_app__.config.globalProperties.$router
      return Object.fromEntries(['pages', 'blog', 'brand', 'links'].map((segment) => {
        const location = router.resolve(`${org}/${segment}`)
        // A directory's index.vue shares its parent's path; it is one level.
        const levels = location.matched.map(record => record.path).filter((path, at, all) => at === 0 || path !== all[at - 1])
        return [segment, { path: location.path, levels }]
      }))
    }, ORG)

    expect(resolved).toEqual({
      pages: { path: `${ORG}/pages`, levels: ['/dashboard/:orgSlug()/settings', '/dashboard/:orgSlug/pages'] },
      blog: { path: `${ORG}/blog`, levels: ['/dashboard/:orgSlug()/settings', '/dashboard/:orgSlug/blog'] },
      brand: { path: `${ORG}/brand`, levels: ['/dashboard/:orgSlug()/settings', '/dashboard/:orgSlug/brand'] },
      links: { path: `${ORG}/links`, levels: ['/dashboard/:orgSlug()/settings', '/dashboard/:orgSlug/pages', '/dashboard/:orgSlug/links'] },
    })
  })

  test('a record list renders beside Menu and selects nothing', async ({ page }) => {
    await page.setViewportSize(WIDE)
    for (const [path, pane] of [['pages', 'organization-pages'], ['blog', 'organization-blog'], ['settings/members', 'organization-members']] as const) {
      await open(page, `${ORG}/${path}`)
      await expectPanes(page, ['organization-settings', pane])
      await expect(page).toHaveURL(`${ORG}/${path}`)
      // Menu names the open row.
      await expect(page.locator('#dashboard-panel-organization-settings [aria-current="page"]')).toHaveCount(1)
    }
  })

  test('the deepest two levels of the page editor own the frame', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await open(page, `${ORG}/pages`)
    await expectPanes(page, ['organization-settings', 'organization-pages'])

    // A page's editor opens its first section, so the frame re-roots onto the page.
    await page.locator('#dashboard-panel-organization-pages').getByRole('link', { name: /^Home/ }).click()
    await expect(page).toHaveURL(new RegExp(`${ORG}/pages/[^/]+/sections$`))
    await expectPanes(page, ['organization-page', 'organization-page-sections'])

    // A section opens its first field: the section and that field own the frame.
    await page.locator('#dashboard-panel-organization-page-sections a[href*="/sections/"]').first().click()
    await expect(page).toHaveURL(new RegExp(`${ORG}/pages/[^/]+/sections/[^/]+/[^/]+$`))
    await expectPanes(page, ['organization-page-block', 'organization-page-block-section'])
  })

  test('Back to an auto-opening index opens its first child again', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await open(page, `${ORG}/settings/integrations`)
    // Integrations is an index of deterministic rows: it opens the first one.
    await expect(page).toHaveURL(`${ORG}/settings/integrations/stripe`)
    await expectPanes(page, ['organization-integrations', 'organization-payouts'])

    await page.locator('#dashboard-panel-organization-integrations a[href$="/google-maps"]').click()
    await expect(page).toHaveURL(`${ORG}/settings/integrations/google-maps`)
    await expectPanes(page, ['organization-integrations', 'integration-google-maps'])

    // Deeper: one location's connection. Google Maps and that location own the frame.
    const location = page.locator('#dashboard-panel-integration-google-maps a[href*="/google-maps/"]').first()
    const locationSlug = (await location.getAttribute('href'))!.split('/').at(-1)!
    await location.click()
    await expect(page).toHaveURL(`${ORG}/settings/integrations/google-maps/${locationSlug}`)
    await expectPanes(page, ['integration-google-maps', `integration-google-maps-${locationSlug}`])

    // In-app Back leads to the bare Integrations index, which must not stay
    // alone at full width: it opens the first Stripe row again.
    const back = page.locator('#dashboard-panel-integration-google-maps [data-testid="dashboard-navbar-back"]')
    await expect(back).toHaveAttribute('href', `${ORG}/settings/integrations`)
    await back.click()
    await expect(page).toHaveURL(`${ORG}/settings/integrations/stripe`)
    await expectPanes(page, ['organization-integrations', 'organization-payouts'])
  })

  test('five destinations keep tenant management in Menu and personal activity in its own context', async ({ page }) => {
    await page.setViewportSize(WIDE)
    await open(page, `${ORG}/settings`)
    await expect(page.getByTestId('dashboard-top-nav').getByRole('navigation', { name: 'Dashboard' }).getByRole('link')).toHaveText(['Today', 'Calendar', 'Locations', 'Messages'])
    await page.getByTestId('dashboard-top-nav-menu-button').click()
    await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('link', { name: 'Payments', exact: true }).click()
    await expect(page).toHaveURL(`${ORG}/payments/overview`)
    await expect(page.locator('#dashboard-panel-payments [data-testid="dashboard-navbar-back"]')).toHaveAttribute('href', `${ORG}/settings`)
    await expect(page.getByText('No captured payment activity in this UTC period.', { exact: true })).toBeVisible()
    for (const view of ['transactions', 'refunds', 'disputes']) {
      await open(page, `${ORG}/payments/${view}`)
      await expect(page.getByText(view === 'transactions' ? 'No transactions in this UTC period.' : `No ${view} yet.`, { exact: true })).toBeVisible()
    }

    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, `${ORG}/payments`)
    const mobileNav = page.getByTestId('dashboard-mobile-nav')
    await expect(mobileNav.getByRole('link')).toHaveText(['Today', 'Calendar', 'Locations', 'Messages', 'Menu'])
    await expect(page.getByTestId('dashboard-mobile-nav-menu-link')).toHaveAttribute('aria-current', 'page')
    await page.locator('#dashboard-panel-payments [data-testid="dashboard-navbar-back"]').click()
    await expect(page).toHaveURL(`${ORG}/settings`)
    await page.locator('#dashboard-panel-organization-settings').getByRole('link', { name: 'Payments', exact: true }).click()
    await expect(page).toHaveURL(`${ORG}/payments`)

    const services = '/dashboard/north-carolina-legal-services'
    await open(page, `${services}/settings`)
    await expect(mobileNav.getByRole('link')).toHaveText(['Today', 'Calendar', 'Locations', 'Messages', 'Menu'])
    await page.locator('#dashboard-panel-organization-settings').getByRole('link', { name: 'Services', exact: true }).click()
    await expect(page).toHaveURL(`${services}/products`)
    await expect(page.getByTestId('dashboard-mobile-nav-menu-link')).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('#dashboard-panel-organization-products [data-testid="dashboard-navbar-back"]')).toHaveAttribute('href', `${services}/settings`)
    await page.locator('#dashboard-panel-organization-products [data-testid="dashboard-navbar-back"]').click()
    await expect(page).toHaveURL(`${services}/settings`)

    await open(page, `${ORG}/settings/payments-billing`)
    await expect(page.getByText('No usage waiting to be reported.', { exact: true })).toBeVisible()
    const account = page.waitForResponse(response => new URL(response.url()).pathname === '/api/account' && response.request().method() === 'GET')
    await open(page, '/account')
    await expect(page).toHaveURL('/dashboard/account/activity')
    const response = await account
    expect(response.status(), await response.text()).toBe(200)
    const activity = await response.json()
    expect(isAccountActivityResponse(activity), 'the account API returns actual owned activity').toBe(true)
    if (!isAccountActivityResponse(activity)) throw new Error('Invalid account activity response')
    await expect(mobileNav.getByRole('link')).toHaveText(['Today', 'Calendar', 'Activity', 'Messages', 'Menu'])
    await expect(mobileNav.getByRole('link', { name: 'Activity', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()
    await expect(page.locator('[data-testid^="account-activity-"]')).toHaveCount(activity.activities.length)
    for (const item of activity.activities) {
      await expect(page.getByTestId(`account-activity-${item.kind}-${item.id}`)).toContainText(item.title)
    }
    // The copied actor's own history may be empty; never create a purchase to
    // make the dashboard assert its fabricated premise.
    if (activity.activities.length) {
      const item = activity.activities[0]!
      const read = await page.request.get('/api/account', { params: { kind: item.kind, id: item.id } })
      expect(read.status(), await read.text()).toBe(200)
      const detail = await read.json()
      expect(isAccountActivityDetailResponse(detail)).toBe(true)
      if (!isAccountActivityDetailResponse(detail)) throw new Error('Invalid activity detail response')
      await page.getByTestId(`account-activity-${item.kind}-${item.id}`).click()
      await expect(page).toHaveURL(`/dashboard/account/activity/${item.kind}/${item.id}`)
      await expect(page.getByRole('heading', { name: item.title, exact: true })).toBeVisible()
      if (detail.activity.payments.length) await expect(page.getByRole('heading', { name: 'Payment info', exact: true })).toHaveCount(detail.activity.payments.length)
      await page.getByTestId('dashboard-navbar-close').click()
      await expect(page).toHaveURL('/dashboard/account/activity')
    } else {
      await expect(page.getByText('No activity yet', { exact: true })).toBeVisible()
    }
    await mobileNav.getByRole('link', { name: 'Today', exact: true }).click()
    await expect(page).toHaveURL('/dashboard/account')
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    await mobileNav.getByRole('link', { name: 'Calendar', exact: true }).click()
    await expect(page).toHaveURL('/dashboard/account/calendar')
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible()
    await mobileNav.getByRole('link', { name: 'Messages', exact: true }).click()
    await expect(page).toHaveURL('/dashboard/account/messages')
    const personalUpdates = page.waitForResponse(response => new URL(response.url()).pathname === '/api/dashboard/notifications'
      && new URL(response.url()).searchParams.get('scope') === 'personal')
    await page.getByRole('tab', { name: 'Updates', exact: true }).click()
    expect((await personalUpdates).status()).toBe(200)
    await expect(page).toHaveURL('/dashboard/account/messages?view=updates')
    await expect(mobileNav.getByRole('link')).toHaveText(['Today', 'Calendar', 'Activity', 'Messages', 'Menu'])
    await page.setViewportSize(WIDE)
    await expect(page.getByTestId('dashboard-top-nav').getByRole('navigation', { name: 'Dashboard' }).getByRole('link')).toHaveText(['Today', 'Calendar', 'Activity', 'Messages'])
  })

  test('booking Change opens its first field on desktop and not below lg', async ({ page }) => {
    const agenda = await page.request.get('/api/dashboard/agenda', { params: { org: 'ember-slice-demo', from: '2000-01-01', to: '2100-01-01' } })
    expect(agenda.status()).toBe(200)
    const { items } = await agenda.json() as { items: Array<{ kind: string; to: string }> }
    const reservation = items.find(item => item.kind === 'reservation' && item.to.includes('/bookings/'))
    expect(reservation, 'the demo fixture carries a reservation').toBeTruthy()
    const change = `${reservation!.to}/change`

    await page.setViewportSize(WIDE)
    await open(page, change)
    // A reservation's Location row is the first row on the screen.
    await expect(page).toHaveURL(`${change}/location`)
    await expectPanes(page, ['booking-change', 'booking-change-field'])

    await page.setViewportSize(NARROW)
    await open(page, change)
    await expectPanes(page, ['booking-change'])
    await expect(page).toHaveURL(change)
  })

  test('a booking opened from the calendar goes Back to its day, and from Today to Today', async ({ page }) => {
    const agenda = await page.request.get('/api/dashboard/agenda', { params: { org: 'ember-slice-demo', from: '2000-01-01', to: '2100-01-01' } })
    expect(agenda.status()).toBe(200)
    const { items } = await agenda.json() as { items: Array<{ kind: string; dayKey: string; to: string }> }
    const reservation = items.find(item => item.kind === 'reservation' && item.to.includes('/bookings/'))
    expect(reservation, 'the demo fixture carries a reservation').toBeTruthy()
    const day = `${ORG}/calendar/${reservation!.dayKey}`
    const fromCalendar = `${day}/reservation/${reservation!.to.split('/').at(-1)}`

    // The same record, mounted under the day: Back is the day and Calendar is the lit tab.
    await page.setViewportSize(NARROW)
    await open(page, fromCalendar)
    await expectPanes(page, ['booking-details'])
    const back = page.locator('#dashboard-panel-booking-details [data-testid="dashboard-navbar-back"]')
    await expect(back).toHaveAttribute('href', day)
    await expect(page.locator('[aria-current="page"]', { hasText: 'Calendar' }).first()).toBeVisible()
    await expect(page.locator('[aria-current="page"]', { hasText: 'Today' })).toHaveCount(0)
    await back.click()
    await expect(page).toHaveURL(day)
    await expectPanes(page, ['calendar-day'])

    await open(page, reservation!.to)
    await expect(page.locator('#dashboard-panel-booking-details [data-testid="dashboard-navbar-back"]')).toHaveAttribute('href', ORG)
    await expect(page.locator('[aria-current="page"]', { hasText: 'Today' }).first()).toBeVisible()
  })

  test('Calendar can filter by a team member and return to all assigned people', async ({ page }) => {
    const membersResponse = await page.request.get('/api/organizations/org-demo/members/scheduling')
    expect(membersResponse.status()).toBe(200)
    const { members } = await membersResponse.json() as { members: Array<{ id: string; name: string }> }
    expect(members.length).toBeGreaterThan(0)
    const member = members[0]!
    await open(page, `${ORG}/calendar`)
    const filter = page.getByRole('combobox', { name: 'Assigned person' })
    await expect(filter).toContainText('All assigned people')
    await filter.click()
    await expect(page.getByRole('option', { name: 'All assigned people', exact: true })).toBeVisible()
    const filtered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/dashboard/agenda'
      && new URL(response.url()).searchParams.get('assigned_member_id') === member.id)
    await page.getByRole('option', { name: member.name, exact: true }).first().click()
    expect((await filtered).status()).toBe(200)
    await expect(filter).toContainText(member.name)
    await filter.click()
    const unfiltered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/dashboard/agenda'
      && !new URL(response.url()).searchParams.has('assigned_member_id'))
    await page.getByRole('option', { name: 'All assigned people', exact: true }).click()
    expect((await unfiltered).status()).toBe(200)
    await expect(filter).toContainText('All assigned people')
  })

  test('below lg every level is one screen and nothing opens itself', async ({ page }) => {
    await page.setViewportSize(NARROW)
    for (const [path, pane] of [['pages', 'organization-pages'], ['brand', 'organization-brand'], ['settings/integrations', 'organization-integrations']] as const) {
      await open(page, `${ORG}/${path}`)
      await expectPanes(page, [pane])
      await expect(page).toHaveURL(`${ORG}/${path}`)
    }

    // A leaf is a sheet whose Close goes to the level that contains it.
    await open(page, `${ORG}/links/title`)
    await expectPanes(page, ['organization-links-title'])
    await expect(page.getByTestId('dashboard-navbar-close')).toHaveAttribute('href', `${ORG}/links`)
    await page.getByTestId('dashboard-navbar-close').click()
    await expect(page).toHaveURL(`${ORG}/links`)
    await expectPanes(page, ['organization-links'])
  })
})
