import { expect, test, type APIRequestContext } from '@playwright/test'
import { dismissPreviewToolbar } from './helpers'
import { loginAs } from './helpers/auth'
import { tenantHostIsAddressable, testBaseUrl } from './test-env'
import { environmentTenantAliasSlug } from '../../server/utils/tenant-hosts'
import { formatMinorAmount } from '../../shared/prices'

/**
 * The subdomain the site is stored under, from the host this environment frames
 * it at.
 *
 * Staging addresses a tenant as `<subdomain>-staging.krabiclaw.com`,
 * so the first label of that hostname carries the environment suffix and is not
 * the stored value. Everywhere else the first label IS the subdomain.
 */
function organizationSubdomain(origin: string): string {
  const hostname = new URL(origin).hostname
  const alias = environmentTenantAliasSlug(hostname, { NUXT_PUBLIC_PLATFORM_DOMAIN: testBaseUrl() })
  return alias ? alias : hostname.split('.')[0]!
}

// The manual-name path of the new-site flow, driven the way an owner drives it:
// the welcome screen, then one question per route, each advanced by the shell's
// own footer; the preview pane framing the owner's pending site on its own
// subdomain; and activation making that site public inside a NEW organization
// that becomes the session's active one. The fixture user owns one more
// organization per run; reset-e2e-artifacts sweeps non-fixture organizations
// older than two hours.
//
// Another tenant already holds an organization-wide collection with the slug
// this owner's menu section takes. A collection slug is unique within its
// organization, so the new site gets the same slug for its own section rather
// than failing to save it.
const otherTenantId = 'org-bVY8SxxUuG6Ctk2CQnfCk8T2cPsj4jJX'
let otherTenant: { owner: APIRequestContext; collectionId: string } | null = null

test.afterEach(async () => {
  if (!otherTenant) return
  const { owner, collectionId } = otherTenant
  otherTenant = null
  const removed = await owner.delete(`/api/editor/organizations/${otherTenantId}/collections/${collectionId}`)
  expect(removed.status(), await removed.text()).toBe(200)
  await owner.dispose()
})

test('a new owner builds a draft and creates a site through the routed flow', async ({ page, request, baseURL, browser, playwright }) => {
  test.setTimeout(180_000)
  const owner = await playwright.request.newContext({ baseURL })
  await loginAs(owner, baseURL!, 'user-e2e-kikuzuki-owner')
  const held = await owner.post(`/api/editor/organizations/${otherTenantId}/collections`, { data: { name: 'Small plates' } })
  expect(held.status(), await held.text()).toBe(201)
  const heldCollection = (await held.json() as { collection: { id: string; slug: string; location_id: string | null } }).collection
  otherTenant = { owner, collectionId: heldCollection.id }
  expect(heldCollection).toMatchObject({ slug: 'small-plates', location_id: null })

  await dismissPreviewToolbar(page)
  await loginAs(page.request, baseURL!, 'user-e2e-onboarding-wizard')

  // A run that stopped part-way leaves this user an active draft, and the
  // welcome screen resumes a draft rather than asking the first question again.
  // Discard it through the product's own discard, which also deletes the pending
  // site holding that address.
  const discarded = await page.request.delete('/api/dashboard/onboarding/drafts/active')
  expect(discarded.status(), await discarded.text()).toBe(200)

  const name = `E2E Wizard ${Date.now().toString(36)}`

  // Every step screen names itself, so waiting on it means "that step is
  // rendered", which the URL alone does not say.
  const step = (id: string) => page.locator(`[data-onboarding-step="${id}"]`)
  // Each press of the footer is a save against a D1 in APAC from a US runner
  // (~194ms a statement), so landing on the next step is given room rather than
  // the default 10s.
  const advance = async (label: string, next: string, timeout = 30_000) => {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(step(next)).toBeVisible({ timeout })
  }

  await page.goto('/dashboard/onboarding')
  // The shell reads the saved draft back before it renders a screen at all, and
  // a click that lands on pre-hydration markup has no handler, so wait for the
  // screen to say it is hydrated rather than merely present.
  await expect(page.locator('[data-onboarding-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Get started', exact: true }).click()

  // A single-choice step is answered by the press itself: no Next to confirm it.
  await expect(step('type')).toBeVisible()
  await page.getByRole('button', { name: 'Restaurant, café or bar' }).click()
  await expect(step('name')).toBeVisible()
  await page.getByPlaceholder('Your business name').fill(name)

  // The first save does the most work of any step in the flow: it creates the
  // organization through Better Auth and then the site itself — seeded pages, a
  // location, a team and the system subdomain — before the pane has anything to
  // frame. Dozens of statements, so it gets 90s rather than 30.
  const firstSaveTimeout = 90_000
  await advance('Next', 'source', firstSaveTimeout)

  const previewFrame = page.locator('iframe[title="Site preview"]')
  await expect(previewFrame).toHaveAttribute('src', /preview_token=/)
  const organizationOrigin = new URL((await previewFrame.getAttribute('src'))!).origin
  if (tenantHostIsAddressable()) {
    const preview = page.frameLocator('iframe[title="Site preview"]')
    await expect(preview.locator('body')).toContainText(name, { timeout: firstSaveTimeout })
    await expect(preview.locator('body')).not.toContainText('did not match its contract')

    // The token authorized the first load and became a cookie, so navigating
    // inside the preview keeps working without it. This is the whole point of
    // the mechanism: the pending site is the real site, and its own links
    // resolve.
    const frame = page.frame({ url: /preview_token=/ })
    expect(frame).not.toBeNull()
    await frame!.evaluate(() => { window.location.href = window.location.pathname })
    await expect(preview.locator('body')).toContainText(name)
  }

  // Nobody else can see it yet. `request` has its own cookie jar, so this asks
  // for the site carrying neither a preview token nor the preview cookie the
  // framed load leaves behind, and gets something that is not the site. Off an
  // addressable tenant host the run carries tenant identity in a header, the way
  // every other tenant spec here does.
  const asAnyone = tenantHostIsAddressable()
    ? { url: `${organizationOrigin}/`, headers: {} }
    : { url: `${baseURL}/`, headers: { 'x-preview-tenant': organizationSubdomain(organizationOrigin) } }
  expect(await (await request.get(asAnyone.url, { headers: asAnyone.headers })).text()).not.toContain(name)

  await page.getByRole('button', { name: 'Enter the details myself' }).click()
  await expect(step('location')).toBeVisible()

  // Location: the country is asked once, and nothing proposes one — it is what
  // the timezone and the currency are both derived from, so the owner names it.
  await page.getByPlaceholder('123 Main Street').fill('88 Moo 2, Ao Nang Beach Road')
  await page.getByPlaceholder('City', { exact: true }).fill('Ao Nang')
  await step('location').getByText('Select country').click()
  await page.getByPlaceholder('Search country...').fill('Thailand')
  await page.getByRole('option', { name: /Thailand/ }).click()
  await advance('Next', 'contact')

  // Contact: the phone picker arrives seeded with that country, and the number
  // is accepted the way a Thai owner writes it, trunk zero included.
  const phone = page.getByPlaceholder('Phone number')
  await expect(phone).toBeEnabled()
  await phone.fill('0812345678')
  await expect(phone).toHaveValue('081 234 5678')
  await advance('Next', 'hours')

  // Hours: the timezone follows the single-zone country the owner named. Zones
  // read as the city and its current offset, not the IANA identifier.
  await expect(step('hours')).toContainText('Bangkok · GMT+7')
  await advance('Save hours', 'currency')

  // Currency: proposed from the country the owner named, and confirmed here
  // before anything is priced. Thailand prices in baht.
  await expect(step('currency')).toContainText('Thai Baht (THB)')
  await advance('Next', 'products')

  // The menu is optional, but a dish the owner names lands in the section they
  // name, and this save writes that section's collection.
  await page.getByPlaceholder('Grilled squid').fill('Grilled squid')
  await page.getByPlaceholder('THB').fill('180')
  await page.getByPlaceholder('Small plates, Skewers, Drinks…').fill('Small plates')
  await page.getByRole('button', { name: 'Add dish' }).click()
  await expect(step('products')).toContainText(formatMinorAmount(18000, 'THB'))
  // The front of house is not optional: colour, logo and photo are, but the
  // headline becomes the home page's only h1, so Next stays disabled until it
  // is answered.
  await advance('Next', 'look')
  const next = page.getByRole('button', { name: 'Next', exact: true })
  await expect(next).toBeDisabled()
  await page.getByPlaceholder('A clear promise guests remember').fill('Fresh from the Andaman, every morning')
  await expect(next).toBeEnabled()
  await advance('Next', 'review')

  // Review: the answers, and the address the next press claims.
  await expect(step('review')).toContainText(name)
  const liveHost = (await step('review').getByText('Your site goes live at').locator('strong').textContent())!.trim()
  expect(liveHost).toBe(new URL(organizationOrigin).host)

  // There is no done screen. Activation lands the owner in their new
  // organization's dashboard, so leaving the flow is how the press reports it
  // finished.
  await page.getByRole('button', { name: 'Create my site', exact: true }).click()
  await expect(page).not.toHaveURL(/\/dashboard\/onboarding/, { timeout: firstSaveTimeout })

  // Activation created a new organization named after the business and made it
  // the session's active one, so post-login lands there too.
  const session = await (await page.request.get('/api/auth/get-session')).json() as { session: { activeOrganizationId: string | null } }
  const organizationId = session.session.activeOrganizationId
  expect(typeof organizationId).toBe('string')
  const organizations = await (await page.request.get('/api/auth/organization/list')).json() as Array<{ id: string; name: string; slug: string }>
  const created = organizations.find(organization => organization.id === organizationId)
  expect(created?.name).toBe(name)
  await expect(page).toHaveURL(new RegExp(`/dashboard/${created!.slug}$`))
  const postLogin = await page.request.get('/api/post-login', { maxRedirects: 0 })
  expect(postLogin.status()).toBe(302)
  expect(postLogin.headers().location).toBe(`/dashboard/${created!.slug}`)

  // The site subdomain and the organization slug are derived separately, so the
  // host the pane framed names the subdomain, not the slug. The organization is
  // the site, so the subdomain is the organization's own.
  const context = await (await page.request.get('/api/dashboard/context', { params: { org: created!.slug } })).json() as { organization: { subdomain: string | null } }
  expect(context.organization.subdomain).toBe(organizationSubdomain(organizationOrigin))

  // And the request that a moment ago did not get the site now does, with no
  // preview token anywhere: that is what activation means.
  const live = await request.get(asAnyone.url, { headers: asAnyone.headers })
  expect(live.status()).toBe(200)
  expect(await live.text()).toContain(name)

  // The new site's section holds the slug the other tenant's collection holds.
  const own = await page.request.get(`/api/editor/organizations/${organizationId}/collections`)
  expect(own.status(), await own.text()).toBe(200)
  const ownCollections = (await own.json() as { collections: Array<{ name: string; slug: string; location_id: string | null }> }).collections
  expect(ownCollections).toEqual([expect.objectContaining({ name: 'Small plates', slug: heldCollection.slug, location_id: null })])

  // An anonymous visitor's menu shows the dish, priced, under that section.
  const visitor = await browser.newContext({ extraHTTPHeaders: asAnyone.headers })
  const menu = await visitor.newPage()
  const menuResponse = await menu.goto(new URL('menu', asAnyone.url).href)
  expect(menuResponse?.status()).toBe(200)
  const section = menu.locator('section').filter({ has: menu.getByRole('heading', { level: 2, name: 'Small plates', exact: true }) })
  await expect(section).toHaveCount(1)
  await expect(section).toContainText('Grilled squid')
  await expect(section).toContainText(formatMinorAmount(18000, 'THB'))
  await visitor.close()
})
