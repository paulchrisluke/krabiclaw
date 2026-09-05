// Walks the real (non-mocked) onboarding + dashboard flows against a local
// dev server, screenshots each step used by the getting-started docs
// and uploads them via POST /api/admin/platform/media for assignment through
// the canonical platform media tools.
//
// Requires: E2E_TEST_PASSWORD in the environment, plus the prepared local E2E
// database and Worker provisioned with that same value. The seeded
// platform-admin credential uploads the finished screenshots.
//
// Usage:
//   node scripts/capture-docs-screenshots.mjs [outDir]
//   ADMIN_USER_ID=some-other-admin node scripts/capture-docs-screenshots.mjs
//
// outDir defaults to /tmp/krabiclaw-docs-screenshots — override with an
// absolute path, e.g. a session scratchpad, if you'd rather not write to /tmp.
//
// After it runs, use the printed asset IDs with the canonical media-placement
// workflow. Do not paste delivery URLs into documentation Markdown.
import { chromium } from 'playwright'
import { findE2eAuthFixture } from '../config/development-auth-fixtures.ts'

const BASE = process.env.KRABICLAW_BASE_URL || 'http://localhost:3000'
const OUT = process.argv[2] || '/tmp/krabiclaw-docs-screenshots'
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'user-e2e-platform-admin'
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD
if (!E2E_TEST_PASSWORD) throw new Error('E2E_TEST_PASSWORD is required for credential sign-in.')

await import('node:fs/promises').then(fs => fs.mkdir(OUT, { recursive: true }))

const browser = await chromium.launch()

async function authenticatePage(page, userId) {
  const fixture = findE2eAuthFixture(userId)
  const origin = new URL(BASE).origin
  const response = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    headers: { origin },
    data: {
      email: fixture.email,
      password: E2E_TEST_PASSWORD,
      rememberMe: false,
    },
  })
  if (!response.ok()) throw new Error(`Credential sign-in failed for ${userId}: ${response.status()} ${await response.text()}`)

  const organizationId = fixture.memberships?.[0]?.organizationId
  if (organizationId) {
    const active = await page.request.post(`${BASE}/api/auth/organization/set-active`, {
      headers: { origin },
      data: { organizationId },
    })
    if (!active.ok()) throw new Error(`Active organization selection failed for ${userId}: ${active.status()} ${await active.text()}`)
  }
}

async function uploadScreenshot(filePath, altText, cookieHeader) {
  const fs = await import('node:fs/promises')
  const buffer = await fs.readFile(filePath)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'image/png' }), filePath.split('/').pop())
  form.append('alt_text', altText)
  const res = await fetch(`${BASE}/api/admin/platform/media`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
    body: form,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`upload failed for ${filePath}: ${JSON.stringify(json)}`)
  return json.asset
}

async function getCookieHeader(page) {
  const cookies = await page.context().cookies()
  return cookies.map(c => `${c.name}=${c.value}`).join('; ')
}

function uniqueName(base) {
  return `${base} ${Date.now()}`
}

async function captureOnboardingFlow(results) {
  const userId = 'user-e2e-onboarding'
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const shot = async (name) => {
    const filePath = `${OUT}/${name}.png`
    await page.screenshot({ path: filePath })
    results.push({ name, filePath })
  }

  await authenticatePage(page, userId)
  await page.goto(`${BASE}/dashboard/onboarding`)
  await page.waitForSelector('text=Tell me about your business')
  await shot('01-welcome')

  await page.getByRole('button', { name: 'Start building' }).click()
  await page.waitForSelector('text=what kind of business is this')
  await shot('02-vertical')

  await page.getByRole('button', { name: /Restaurant, café or bar/ }).click()
  await page.waitForSelector('text=add your business details')
  await shot('03-source')

  await page.getByRole('button', { name: /Start manually/ }).click()
  await page.waitForSelector('text=the name of your business')
  await page.getByPlaceholder('Your business name…').fill(uniqueName('The Garden Bistro'))
  await page.keyboard.press('Enter')
  await page.waitForSelector('text=Manager alert number')
  await page.waitForTimeout(300)
  await shot('04-details-form')

  // Required fields: city, address, phone, hours, manager alert number.
  // Timezone + currency auto-default from the browser/country.
  await page.getByLabel('City', { exact: false }).fill('Bangkok')
  await page.locator('textarea[placeholder="Street, ward, district"]').fill('123 Demo Street, Sample District, Bangkok 10110')
  await page.getByLabel('Phone', { exact: false }).fill('+66 81 234 5678')
  await page.locator('textarea').nth(1).fill('Monday: 11:00 AM - 10:00 PM\nTuesday: 11:00 AM - 10:00 PM')
  await page.getByLabel('Manager alert number', { exact: false }).fill('+66 81 234 5678')
  await page.waitForTimeout(200)
  await shot('05-details-filled')

  // First "Create site" saves a private DRAFT, not the real site yet.
  await page.getByRole('button', { name: 'Create site' }).click()
  await page.waitForSelector('text=Draft ready', { timeout: 20000 })
  await page.waitForTimeout(500)
  await shot('06-draft-ready')

  // Second "Create site" is the quick-reply chip that commits the draft for real.
  await page.getByRole('button', { name: 'Create site' }).last().click()
  await page.waitForSelector('text=Make it yours', { timeout: 20000 })
  // Auto-scroll moves past the brand essentials card by the time the next
  // bot message lands — scroll it back into view before screenshotting.
  await page.locator('text=Make it yours').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await shot('07-brand-essentials')

  await page.getByRole('button', { name: 'Skip for now' }).click()
  await page.waitForSelector('text=Three ways to keep building', { timeout: 10000 })
  await page.waitForTimeout(500)
  await shot('08-done')

  await page.close()
  return userId
}

async function captureDashboardPages(results, userId) {
  // Reuse the exact credentialed user that completed the onboarding flow so
  // the dashboard screenshots show the business created above.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const shot = async (name) => {
    const filePath = `${OUT}/${name}.png`
    await page.screenshot({ path: filePath })
    results.push({ name, filePath })
  }

  await authenticatePage(page, userId)
  const ctx = await page.evaluate(async () => {
    const res = await fetch('/api/dashboard/context')
    return res.json()
  })
  const orgSlug = ctx?.organization?.slug
  if (!orgSlug) {
    console.warn('No org/site found for the onboarded user — skipping dashboard screenshots.')
    await page.close()
    return
  }

  // Post-onboarding checklist card (site workspace home)
  const siteSlug = ctx.sites?.[0]?.subdomain ?? orgSlug
  await page.goto(`${BASE}/dashboard/${orgSlug}/sites/${siteSlug}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await shot('09-checklist')

  // Team invite page
  await page.goto(`${BASE}/dashboard/${orgSlug}/settings/members`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  await shot('10-team-invite')

  // Notifications card (Settings -> General) — close the ServiceUpsellModal
  // promo (components/billing/ServiceUpsellModal.vue) if it auto-opens.
  await page.goto(`${BASE}/dashboard/${orgSlug}/sites/${siteSlug}/settings`)
  await page.waitForLoadState('networkidle')
  const upsellClose = page.locator('button:has(.i-heroicons-x-mark)').first()
  if (await upsellClose.isVisible().catch(() => false)) await upsellClose.click()
  await page.waitForTimeout(500)
  await page.locator('text=Notifications', { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)
  await shot('11-notifications')

  await page.close()
}

async function main() {
  const results = []
  const onboardedUserId = await captureOnboardingFlow(results)
  await captureDashboardPages(results, onboardedUserId)

  console.log(`\nCaptured ${results.length} screenshots to ${OUT}\n`)

  // Upload everything via the admin platform-media route.
  const loginPage = await chromium.launch().then(b => b.newPage())
  try {
    await authenticatePage(loginPage, ADMIN_USER_ID)
    const cookieHeader = await getCookieHeader(loginPage)

    const uploaded = {}
    for (const { name, filePath } of results) {
      const altText = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const asset = await uploadScreenshot(filePath, `Screenshot: ${altText}`, cookieHeader)
      uploaded[name] = { id: asset.id, public_url: asset.public_url }
      console.log(`${name}: ${asset.public_url}  (asset_id: ${asset.id})`)
    }

    console.log('\nJSON summary:\n')
    console.log(JSON.stringify(uploaded, null, 2))
  } finally {
    await loginPage.context().browser().close()
  }
}

try {
  await main()
} finally {
  await browser.close()
}
