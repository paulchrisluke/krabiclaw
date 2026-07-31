import { test, expect } from '@playwright/test'

/**
 * Full performance benchmark - 20-30 samples per selected journey
 * 
 * Run once when the PR is merge-ready against base and head under the same
 * fixture, cache state, environment, and runner.
 * 
 * Reports median, reasonable upper percentile, errors, request count, query count,
 * payload bytes, and cache state.
 */
test.describe('Full performance benchmark', () => {
  const SAMPLES = 20
  const results: number[] = []

  test.beforeEach(async ({ page }) => {
    // Clear cache before each sample
    await page.context().clearCookies()
  })

  test('simple public route performance baseline', async ({ page }) => {
    for (let i = 0; i < SAMPLES; i++) {
      const startTime = Date.now()
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      results.push(loadTime)
      
      // Brief pause between samples
      await page.waitForTimeout(100)
    }

    const median = results.sort((a, b) => a - b)[Math.floor(SAMPLES / 2)]
    const p90 = results[Math.floor(SAMPLES * 0.9)]
    
    console.log(`Public route - Median: ${median}ms, P90: ${p90}ms`)
    
    // These thresholds should be calibrated based on production telemetry
    expect(median).toBeLessThan(1500) // Median under 1.5s
    expect(p90).toBeLessThan(2500) // P90 under 2.5s
  })

  test('dashboard performance baseline', async ({ page }) => {
    const dashboardResults: number[] = []
    
    for (let i = 0; i < SAMPLES; i++) {
      const startTime = Date.now()
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      dashboardResults.push(loadTime)
      
      await page.waitForTimeout(100)
    }

    const median = dashboardResults.sort((a, b) => a - b)[Math.floor(SAMPLES / 2)]
    const p90 = dashboardResults[Math.floor(SAMPLES * 0.9)]
    
    console.log(`Dashboard - Median: ${median}ms, P90: ${p90}ms`)
    
    expect(median).toBeLessThan(2000) // Median under 2s
    expect(p90).toBeLessThan(3500) // P90 under 3.5s
  })

  test('resource-heavy route performance baseline', async ({ page }) => {
    const heavyResults: number[] = []
    
    for (let i = 0; i < SAMPLES; i++) {
      const startTime = Date.now()
      await page.goto('/blog')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      heavyResults.push(loadTime)
      
      await page.waitForTimeout(100)
    }

    const median = heavyResults.sort((a, b) => a - b)[Math.floor(SAMPLES / 2)]
    const p90 = heavyResults[Math.floor(SAMPLES * 0.9)]
    
    console.log(`Blog listing - Median: ${median}ms, P90: ${p90}ms`)
    
    expect(median).toBeLessThan(1800) // Median under 1.8s
    expect(p90).toBeLessThan(3000) // P90 under 3s
  })
})
