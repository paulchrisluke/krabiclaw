import { expect, type Page } from '@playwright/test'
import { tenantTestBaseUrl } from './test-env'

export const tenantBaseURL = tenantTestBaseUrl()

export function collectPageErrors(page: Page) {
  const errors: string[] = []

  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[BROWSER ${message.type().toUpperCase()}] ${text}`)
    }
    if (message.type() === 'error') errors.push(text)
    // Catch Vue Router "No match found" warnings (these indicate /undefined navigations)
    if (message.type() === 'warning' && text.includes('No match found for location with path')) {
      errors.push(`Vue Router warn: ${text}`)
    }
  })

  page.on('pageerror', (error) => {
    console.log(`[BROWSER PAGEERROR] ${error.stack || error.message}`)
    errors.push(error.message)
  })

  return errors
}

export async function expectHealthyPage(page: Page, errors: string[]) {
  await expect(page.locator('body')).not.toContainText('Site Not Found')
  await expect(page.locator('body')).not.toContainText('Vite Error')
  // Catch post-hydration 500/404: error.vue renders the status code as <h1>
  await expect(page.locator('h1')).not.toHaveText(/^(404|500|503)$/)
  // Catch the custom error page copy
  await expect(page.locator('body')).not.toContainText('wrong link sando')
  expect(errors).toEqual([])
}
