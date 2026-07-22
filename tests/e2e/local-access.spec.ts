import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { dashboardOrgHeaders, devLoginHeaders, devLoginUrl } from './test-env'
import { collectPageErrors } from './helpers'

const POTTERY_OWNER_USER_ID = 'user-pottery-house'
const SITE_ID = 'site-pottery-house'
const LOCATION_ID = 'loc-pottery-house'

function localD1Query<T>(sql: string): T[] {
  const output = execFileSync('yarn', [
    '-s', 'wrangler', 'd1', 'execute', 'DB', '--local', '--json', '--command', sql,
  ], { cwd: process.cwd(), encoding: 'utf8' })
  return (JSON.parse(output)?.[0]?.results ?? []) as T[]
}

function sqlValue(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

test('owner can configure a site- or location-scoped editor invitation', async ({ page, baseURL }) => {
  test.setTimeout(60_000)
  const pageErrors = collectPageErrors(page)
  await page.context().setExtraHTTPHeaders(devLoginHeaders() || {})
  const login = await page.goto(devLoginUrl(baseURL!, POTTERY_OWNER_USER_ID), { waitUntil: 'load' })
  expect(login?.status()).toBeLessThan(400)

  await page.goto(`${baseURL}/dashboard/pottery-house-krabi/settings/members`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as Element & { __vue_app__?: unknown } | null)?.__vue_app__))
  await expect(page.getByRole('heading', { name: 'Invite a team member' })).toBeVisible()
  expect(pageErrors).toEqual([])

  const roleSelect = page.getByRole('combobox', { name: 'Role' })
  const editorOption = page.getByRole('option', { name: 'Editor' })
  await expect(async () => {
    if (!await editorOption.isVisible()) await roleSelect.click()
    await expect(editorOption).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  await editorOption.click()
  await expect(roleSelect).toContainText('Editor')

  await expect(page.getByLabel('Site')).toBeVisible()
  await expect(page.getByLabel('Location')).toBeDisabled()
  await expect(page.getByText('Editors are always scoped to a site')).toBeVisible()

  const siteSelect = page.getByRole('combobox', { name: 'Site' })
  await siteSelect.click()
  await page.getByRole('option', { name: 'Pottery House Krabi', exact: true }).click()
  await expect(siteSelect).toContainText('Pottery House Krabi')
  await expect(page.getByLabel('Location')).toBeEnabled()

  const locationSelect = page.getByRole('combobox', { name: 'Location' })
  await locationSelect.click()
  await page.getByRole('option', { name: 'Pottery House — Beachfront at Klong Muang', exact: true }).click()
  await expect(locationSelect).toContainText('Pottery House — Beachfront at Klong Muang')
})

test('phone invitation verifies identity, accepts access, and opens the scoped dashboard', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  test.skip(new URL(baseURL!).hostname !== 'localhost', 'This smoke test retrieves its log-only OTP from local D1.')

  await page.context().setExtraHTTPHeaders(devLoginHeaders() || {})
  const ownerLogin = await page.goto(devLoginUrl(baseURL!, POTTERY_OWNER_USER_ID), { waitUntil: 'load' })
  expect(ownerLogin?.status()).toBeLessThan(400)

  const suffix = String(Date.now()).slice(-8)
  const phone = `+669${suffix}`
  const invitationEmail = `phone-${phone.slice(1)}@phone.krabiclaw.local`
  const locationUpdate = await page.request.patch(`${baseURL}/api/dashboard/locations/${LOCATION_ID}`, {
    headers: dashboardOrgHeaders('pottery-house-krabi'),
    data: { notification_phone: phone },
  })
  expect([200, 207]).toContain(locationUpdate.status())
  expect((await locationUpdate.json() as { warning?: string }).warning).toBeUndefined()

  let invitation: { id: string } | undefined
  await expect.poll(() => {
    invitation = localD1Query<{ id: string }>(`
      SELECT id FROM invitation
      WHERE organizationId = 'org-pottery-house'
        AND email = ${sqlValue(invitationEmail)}
        AND status = 'pending'
      ORDER BY createdAt DESC LIMIT 1
    `)[0]
    return invitation?.id
  }, {
    message: 'WhatsApp access update did not create a pending invitation',
    timeout: 15_000,
  }).toEqual(expect.any(String))
  if (!invitation) throw new Error('WhatsApp access update did not create a pending invitation')

  await page.context().clearCookies()
  await page.goto(`${baseURL}/accept-invitation/${invitation.id}?siteId=${SITE_ID}`, { waitUntil: 'load' })
  await expect(page.getByRole('heading', { name: 'Join Pottery House Krabi' })).toBeVisible()
  await expect(page.getByText(`Verify ${phone} to continue.`)).toBeVisible()

  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()

  let code = ''
  await expect.poll(() => {
    const verification = localD1Query<{ value: string }>(`
      SELECT value FROM verification
      WHERE identifier = ${sqlValue(phone)}
      ORDER BY createdAt DESC LIMIT 1
    `)[0]
    code = String(verification?.value || '').split(':')[0] ?? ''
    return code
  }, { timeout: 15_000 }).toMatch(/^\d{6}$/)

  await page.getByLabel('Verification code').fill(code)
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 })

  const sessionResponse = await page.request.get(`${baseURL}/api/auth/get-session`)
  expect(sessionResponse.status()).toBe(200)
  const session = await sessionResponse.json() as { user?: { phoneNumber?: string; email?: string } }
  expect(session.user?.phoneNumber).toBe(phone)
  expect(session.user?.email).toBe(invitationEmail)

  const contextResponse = await page.request.get(`${baseURL}/api/dashboard/context`, {
    headers: { 'x-dashboard-site-slug': 'pottery-house' },
  })
  expect(contextResponse.status()).toBe(200)
  const dashboard = await contextResponse.json() as {
    organization?: { id?: string; role?: string }
    site?: { id?: string }
    locations?: Array<{ id?: string }>
  }
  expect(dashboard.organization?.id).toBe('org-pottery-house')
  expect(dashboard.organization?.role).toBe('editor')
  expect(dashboard.site?.id).toBe(SITE_ID)
  expect(dashboard.locations?.map(location => location.id)).toContain(LOCATION_ID)

  const acceptedResponse = await page.request.get(`${baseURL}/api/invitations/${invitation.id}?siteId=${SITE_ID}`)
  expect(acceptedResponse.status()).toBe(200)
  expect(await acceptedResponse.json()).toMatchObject({ status: 'accepted' })
})
