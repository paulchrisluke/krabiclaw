import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage } from './helpers'
import { loginAsPage } from './helpers/auth'
import { dashboardOrgHeaders } from './test-env'

test('platform admin enters and exits a client workspace through Better Auth impersonation', async ({ page, baseURL }) => {
  test.setTimeout(90_000)
  const hostname = new URL(baseURL!).hostname
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const isStaging = hostname === 'staging.krabiclaw.com'
  test.skip(!isLocal && !isStaging, 'This smoke test targets the local fixture or the seeded staging fixture.')

  const errors = collectPageErrors(page)
  const adminUserId = 'user-e2e-platform-admin'

  await loginAsPage(page, baseURL!, adminUserId)
  await page.goto(`${baseURL}/api/post-login`, { waitUntil: 'load' })
  await expect(page).toHaveURL(/\/admin(?:\/|$)/)

  const adminAccess = await page.request.get(`${baseURL}/api/admin/access`)
  expect(adminAccess.status()).toBe(200)
  expect(await adminAccess.json()).toMatchObject({ allowed: true })

  const clientsPage = await page.goto(`${baseURL}/admin/clients`, { waitUntil: 'load' })
  expect(clientsPage?.status()).toBeLessThan(400)
  await expect(page.getByText('Pottery House Krabi', { exact: true }).first()).toBeVisible()

  const workspaceButton = page.getByRole('button', { name: 'Open Pottery House Krabi workspace' })
  await expect(workspaceButton).toBeEnabled()
  await workspaceButton.click()

  await expect(page).toHaveURL(/\/dashboard\/pottery-house-krabi$/)
  await expect(page.getByText(/Impersonating/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exit to Admin' })).toBeVisible()

  const dashboardContext = await page.request.get(`${baseURL}/api/dashboard/context`, {
    headers: dashboardOrgHeaders('pottery-house-krabi'),
  })
  expect(dashboardContext.status()).toBe(200)
  const dashboardBody = await dashboardContext.json() as { organization?: { id?: string; role?: string } }
  expect(dashboardBody.organization).toMatchObject({ id: 'org-pottery-house', role: 'owner' })

  await page.getByRole('button', { name: 'Exit to Admin' }).click()
  await expect(page).toHaveURL(/\/admin\/users$/)
  await expect(page.getByText(/Impersonating/)).toHaveCount(0)

  const adminUsers = await page.request.get(`${baseURL}/api/admin/users`)
  expect(adminUsers.status()).toBe(200)
  const adminUsersBody = await adminUsers.json() as { users?: Array<{ id?: string }> }
  expect(adminUsersBody.users?.some(user => user.id === adminUserId)).toBe(true)
  await expect(page.locator('body')).not.toContainText('Failed to load users')

  await page.goto(`${baseURL}/admin/clients`, { waitUntil: 'load' })
  await expect(page.getByRole('button', { name: 'Open Pottery House Krabi workspace' })).toBeEnabled()

  await expectHealthyPage(page, errors)
})
