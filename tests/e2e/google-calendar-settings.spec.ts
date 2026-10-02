import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'

test('Calendar settings uses shared tenant controls and states the outbound policy', async ({ page, baseURL }, testInfo) => {
  test.skip(process.env.CALENDAR_SETTINGS_PROOF !== 'true', 'Opt-in local Calendar settings evidence')
  test.skip(!['localhost', '127.0.0.1'].includes(new URL(baseURL!).hostname), 'Calendar consent is not part of the local proof')
  await loginAs(page.request, baseURL!, 'user-e2e-ncls-owner')
  await page.goto('/dashboard/north-carolina-legal-services/settings/integrations/google-calendar')
  await expect(page.getByRole('heading', { name: 'Google Calendar', exact: true })).toBeVisible()
  await expect(page.getByText('Google events do not block availability.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect Google Calendar', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Also mirror Reservations', exact: true })).not.toBeChecked()
  await expect(page.getByText('Consultation calendar group', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Google Analytics/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Google Search Console/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('calendar-settings-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Google Calendar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect Google Calendar', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('calendar-settings-mobile.png'), fullPage: true })
})
