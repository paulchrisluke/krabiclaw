import { expect, type Page } from '@playwright/test'

export const tenantBaseURL = process.env.PLAYWRIGHT_TENANT_BASE_URL!

export function collectPageErrors(page: Page) {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  return errors
}

export async function expectHealthyPage(page: Page, errors: string[]) {
  await expect(page.locator('body')).not.toContainText('Site Not Found')
  await expect(page.locator('body')).not.toContainText('Vite Error')
  expect(errors).toEqual([])
}
