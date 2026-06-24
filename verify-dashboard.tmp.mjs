import { chromium } from 'playwright'

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

console.log('--- Login as user-demo ---')
await page.goto('http://localhost:3000/api/dev/login?userId=user-demo', { waitUntil: 'networkidle' })
console.log('Post-login URL:', page.url())

console.log('\n--- Generate fresh traffic on demo tenant site as a different browser context (simulating visitor) ---')
const visitorContext = await browser.newContext()
const visitorPage = await visitorContext.newPage()
await visitorPage.goto('http://demo.localhost:3000/', { waitUntil: 'networkidle' })
await visitorPage.waitForTimeout(800)
const aboutCount = await visitorPage.locator('a[href="/about"]').count()
if (aboutCount > 0) {
  await visitorPage.locator('a[href="/about"]').first().click()
  await visitorPage.waitForTimeout(1500)
}
await visitorContext.close()

console.log('\n--- Navigate to dashboard analytics page for the demo org/site ---')
// Find org slug
const navRes = await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' })
console.log('Dashboard root status:', navRes?.status(), 'url:', page.url())
await page.screenshot({ path: '/tmp/dashboard-root.png', fullPage: true })

await page.waitForTimeout(1000)
console.log(await page.title())
