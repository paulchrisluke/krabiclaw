/**
 * Playwright bug-check script.
 * 1. Opens a headed browser to localhost:3000
 * 2. Waits for you to log in (detects when you hit /dashboard)
 * 3. Crawls all dashboard pages, takes screenshots, logs console errors
 */

import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const SCREENSHOT_DIR = './scripts/screenshots'
mkdirSync(SCREENSHOT_DIR, { recursive: true })

const errors = []
const warnings = []
const pageResults = []

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function checkPage(page, label, url) {
  console.log(`\n→ ${label}`)
  const pageErrors = []
  const pageWarnings = []

  const handler = (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text())
    if (msg.type() === 'warning') pageWarnings.push(msg.text())
  }
  page.on('console', handler)

  const networkErrors = []
  page.on('response', (res) => {
    if (res.status() >= 400) networkErrors.push(`${res.status()} ${res.url()}`)
  })

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
  } catch (e) {
    pageErrors.push(`Navigation timeout/error: ${e.message}`)
  }

  // Wait a bit for async rendering
  await page.waitForTimeout(1500)

  const screenshotPath = join(SCREENSHOT_DIR, `${slug(label)}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  page.off('console', handler)

  const result = { label, url, errors: pageErrors, warnings: pageWarnings, networkErrors, screenshotPath }
  pageResults.push(result)

  if (pageErrors.length) {
    console.log(`  ✗ ${pageErrors.length} console error(s):`)
    pageErrors.forEach(e => console.log(`    - ${e.slice(0, 120)}`))
  }
  if (networkErrors.length) {
    console.log(`  ✗ ${networkErrors.length} network error(s):`)
    networkErrors.forEach(e => console.log(`    - ${e}`))
  }
  if (!pageErrors.length && !networkErrors.length) {
    console.log(`  ✓ Clean`)
  }

  return result
}

const STATE_FILE = './scripts/.auth-state.json'

;(async () => {
  if (!existsSync(STATE_FILE)) {
    console.error('No saved auth state found.')
    console.error('Run first:  node scripts/bugcheck-setup.mjs')
    process.exit(1)
  }

  console.log('\n=== Kikuzuki Dashboard Bug Check ===')
  console.log('Loading saved auth state...')

  const browser = await chromium.launch({ headless: false, slowMo: 30 })
  const context = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1400, height: 900 },
  })
  const page = await context.newPage()

  // Verify session is still valid
  try {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (e) {
    console.error('Could not reach localhost:3000 — is yarn dev running?')
    await browser.close()
    process.exit(1)
  }

  // Give it a moment to redirect if needed
  await page.waitForTimeout(2000)

  if (page.url().includes('/login')) {
    console.log('\nSession expired — please log in in the browser window (5 min timeout)...')
    try {
      await page.waitForURL(url => url.includes('/dashboard'), { timeout: 300000 })
    } catch {
      console.error('Timed out. Re-run:  node scripts/bugcheck-setup.mjs')
      await browser.close()
      process.exit(1)
    }
    // Save refreshed session
    await context.storageState({ path: STATE_FILE })
    console.log('✓ Session refreshed and saved.')
  }

  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1000)
  console.log('✓ Session valid. Starting crawl...')

  // Discover siteId from the dashboard
  await page.goto(`${BASE}/dashboard/sites`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Try to grab first "Manage" link to get a real siteId
  const manageLink = page.locator('a[href*="/dashboard/sites/site-"]').first()
  let siteId = null
  try {
    const href = await manageLink.getAttribute('href', { timeout: 3000 })
    siteId = href?.match(/sites\/(site-[^/]+)/)?.[1]
  } catch {}

  console.log(`\nSite ID: ${siteId || '(none found — org-level pages only)'}`)

  // --- Org-level pages ---
  await checkPage(page, 'Dashboard home', `${BASE}/dashboard`)
  await checkPage(page, 'Sites list', `${BASE}/dashboard/sites`)
  await checkPage(page, 'Billing', `${BASE}/dashboard/billing`)
  await checkPage(page, 'Integrations', `${BASE}/dashboard/integrations`)

  // --- Site-level pages ---
  if (siteId) {
    const base = `${BASE}/dashboard/sites/${siteId}`

    await checkPage(page, 'Site overview', `${base}`)
    await checkPage(page, 'Content editor', `${base}/content`)
    await checkPage(page, 'Locations', `${base}/locations`)
    await checkPage(page, 'Menu (no location)', `${base}/menu`)
    await checkPage(page, 'Launch', `${base}/launch`)
    await checkPage(page, 'Site settings', `${base}/settings`)

    // Try to get a locationId for the menu page
    await page.goto(`${base}/locations`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    const editMenuBtn = page.locator('a[href*="locationId="]').first()
    let locationId = null
    try {
      const href = await editMenuBtn.getAttribute('href', { timeout: 3000 })
      locationId = href?.match(/locationId=([^&]+)/)?.[1]
    } catch {}

    if (locationId) {
      await checkPage(page, 'Menu (with location)', `${base}/menu?locationId=${locationId}`)
    }
  }

  // --- Summary ---
  console.log('\n\n=== SUMMARY ===\n')
  let totalErrors = 0
  let totalNetworkErrors = 0
  for (const r of pageResults) {
    const e = r.errors.length + r.networkErrors.length
    totalErrors += r.errors.length
    totalNetworkErrors += r.networkErrors.length
    const icon = e === 0 ? '✓' : '✗'
    console.log(`${icon}  ${r.label.padEnd(30)} ${e > 0 ? `${e} issue(s)` : 'clean'}`)
  }
  console.log(`\nTotal console errors : ${totalErrors}`)
  console.log(`Total network errors : ${totalNetworkErrors}`)
  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}/`)

  // Save JSON report
  const reportPath = './scripts/bugcheck-report.json'
  writeFileSync(reportPath, JSON.stringify(pageResults, null, 2))
  console.log(`Full report: ${reportPath}`)

  await browser.close()
})()
