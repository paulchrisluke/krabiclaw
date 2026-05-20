import { expect, type Page } from '@playwright/test'
import { tenantTestBaseUrl } from './test-env'

export const tenantBaseURL = tenantTestBaseUrl()

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
