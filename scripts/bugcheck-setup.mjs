/**
 * Run this ONCE to save your logged-in session.
 * After this, bugcheck.mjs loads the saved state automatically — no login needed.
 *
 *   node scripts/bugcheck-setup.mjs
 */

import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const STATE_FILE = './scripts/.auth-state.json'

mkdirSync('./scripts', { recursive: true })

;(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  console.log('\n=== One-time auth setup ===')
  console.log('Hitting dev login endpoint...')

  await page.goto(`${BASE}/api/dev/login`, { waitUntil: 'networkidle', timeout: 15000 })

  if (!page.url().includes('/dashboard')) {
    console.error('Dev login failed — is yarn dev running?')
    console.error(`Current URL: ${page.url()}`)
    await browser.close()
    process.exit(1)
  }

  await page.waitForLoadState('networkidle').catch(() => {})

  // Save cookies + localStorage to disk
  await context.storageState({ path: STATE_FILE })
  console.log(`\n✓ Auth state saved to ${STATE_FILE}`)
  console.log('  Run  node scripts/bugcheck.mjs  to start crawling.\n')

  await browser.close()
})()
