import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { collectPageErrors } from './helpers'
import { dashboardOrgHeaders, devLoginHeaders, devLoginUrl } from './test-env'

function promoteLocalPlatformAdmin(email: string) {
  execFileSync('yarn', [
    'platform-admin:break-glass-promote',
    '--email',
    email,
    '--local',
  ], { cwd: process.cwd(), encoding: 'utf8' })
}

test('platform admin enters and exits a client workspace through Better Auth impersonation', async ({ page, baseURL }) => {
  test.setTimeout(90_000)
  test.skip(new URL(baseURL!).hostname !== 'localhost', 'This smoke test promotes a local-only platform admin user.')

  const errors = collectPageErrors(page)
  const adminUserId = `e2e-admin-impersonation-${Date.now()}`
  const adminEmail = `${adminUserId}@example.test`

  await page.context().setExtraHTTPHeaders(devLoginHeaders() || {})
  const initialLogin = await page.goto(devLoginUrl(baseURL!, adminUserId), { waitUntil: 'load' })
  expect(initialLogin?.status()).toBeLessThan(400)

  promoteLocalPlatformAdmin(adminEmail)

  const adminLogin = await page.goto(devLoginUrl(baseURL!, adminUserId), { waitUntil: 'load' })
  expect(adminLogin?.status()).toBeLessThan(400)
  await expect(page).toHaveURL(/\/admin(?:\/|$)/)

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

  const adminAccess = await page.request.get(`${baseURL}/api/admin/access`)
  expect(adminAccess.status()).toBe(200)
  expect(await adminAccess.json()).toMatchObject({ allowed: true })

  await page.goto(`${baseURL}/admin/clients`, { waitUntil: 'load' })
  const translationsButton = page.getByRole('button', { name: 'Open Pottery House Krabi translations' })
  await expect(translationsButton).toBeEnabled()
  await translationsButton.click()

  await expect(page).toHaveURL(/\/dashboard\/pottery-house-krabi\/sites\/pottery-house\/translations$/)
  await expect(page.getByText(/Impersonating/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exit to Admin' })).toBeVisible()

  expect(errors).toEqual([])
})
