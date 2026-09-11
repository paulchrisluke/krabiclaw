import { expect, test } from '@playwright/test'
import { collectPageErrors, dismissPreviewToolbar } from './helpers'
import { loginAs } from './helpers/auth'
import { tenantHostIsAddressable } from './test-env'

// The manual-name path of the new-site flow, driven the way an owner drives it:
// the welcome screen, then one question per route, each advanced by the shell's
// own footer; the preview pane framing the owner's pending site on its own
// subdomain; and activation making that site public inside a NEW organization
// that becomes the session's active one. The fixture user owns one more
// organization per run; reset-e2e-artifacts sweeps non-fixture organizations
// older than two hours.
test('a new owner builds a draft and creates a site through the routed flow', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000)
  await dismissPreviewToolbar(page)
  await loginAs(page.request, baseURL!, 'user-e2e-onboarding-wizard')

  // A run that stopped part-way leaves this user an active draft, and the
  // welcome screen resumes a draft rather than asking the first question again.
  // Discard it through the product's own discard, which also deletes the pending
  // site holding that address.
  const discarded = await page.request.delete('/api/dashboard/onboarding/drafts/active')
  expect(discarded.status(), await discarded.text()).toBe(200)

  const errors = collectPageErrors(page)
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
  const siteOrigin = new URL((await previewFrame.getAttribute('src'))!).origin
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
    ? { url: `${siteOrigin}/`, headers: {} }
    : { url: `${baseURL}/`, headers: { 'x-preview-tenant': new URL(siteOrigin).hostname.split('.')[0]! } }
  expect(await (await request.get(asAnyone.url, { headers: asAnyone.headers })).text()).not.toContain(name)

  await page.getByRole('button', { name: 'Enter the details myself' }).click()
  await expect(step('location')).toBeVisible()

  // Location: the country is asked once, as a picker that arrives on the product
  // default (United States) and is changed here.
  await page.getByPlaceholder('123 Main Street').fill('88 Moo 2, Ao Nang Beach Road')
  await page.getByPlaceholder('City', { exact: true }).fill('Ao Nang')
  await step('location').getByText('United States').click()
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
  await advance('Save hours', 'products')

  // The menu is optional and the footer says so. The front of house is not:
  // colour, logo and photo are, but the headline becomes the home page's only
  // h1, so Next stays disabled until it is answered.
  await advance('Skip for now', 'look')
  const next = page.getByRole('button', { name: 'Next', exact: true })
  await expect(next).toBeDisabled()
  await page.getByPlaceholder('A clear promise guests remember').fill('Fresh from the Andaman, every morning')
  await expect(next).toBeEnabled()
  await advance('Next', 'review')

  // Review: the answers, and the address the next press claims.
  await expect(step('review')).toContainText(name)
  const liveHost = (await step('review').getByText('Your site goes live at').locator('strong').textContent())!.trim()
  expect(liveHost).toBe(new URL(siteOrigin).host)

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
  // host the pane framed names the subdomain, not the slug. A new organization
  // owns exactly one site.
  const context = await (await page.request.get('/api/dashboard/context', { params: { org: created!.slug } })).json() as { sites: Array<{ subdomain: string | null }> }
  expect(context.sites).toHaveLength(1)
  expect(context.sites[0]!.subdomain).toBe(new URL(siteOrigin).hostname.split('.')[0])

  // And the request that a moment ago did not get the site now does, with no
  // preview token anywhere: that is what activation means.
  const live = await request.get(asAnyone.url, { headers: asAnyone.headers })
  expect(live.status()).toBe(200)
  expect(await live.text()).toContain(name)

  // The collector sees the framed site's console as well as the flow's, and both
  // have to be clean: the pane frames the owner's own site, so a mismatch in
  // there is this flow's defect too.
  expect(errors).toEqual([])
})
