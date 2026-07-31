import { test, expect } from '@playwright/test'

/**
 * PR smoke benchmark - 3-5 samples for affected representative journeys
 * 
 * This detects catastrophic regressions in performance-sensitive paths.
 * It is not intended to produce stable tail percentiles.
 */
test.describe('Performance smoke benchmark', () => {
  test('simple public route loads quickly', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime
    
    // Allow up to 2 seconds for cold load
    expect(loadTime).toBeLessThan(2000)
  })

  test('dashboard navigation is responsive', async ({ page }) => {
    // Login flow would go here in real implementation
    const startTime = Date.now()
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime
    
    // Allow up to 3 seconds for dashboard load
    expect(loadTime).toBeLessThan(3000)
  })

  test('public page renders efficiently', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/blog')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime
    
    // Allow up to 2.5 seconds for blog listing
    expect(loadTime).toBeLessThan(2500)
  })
})
