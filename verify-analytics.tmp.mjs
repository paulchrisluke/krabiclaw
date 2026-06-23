import { chromium } from 'playwright'

const trackRequests = []

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

page.on('request', (req) => {
  if (req.url().includes('/api/analytics/track')) {
    trackRequests.push({ url: req.url(), method: req.method(), postData: req.postData() })
  }
})

const responses = []
page.on('response', async (res) => {
  if (res.url().includes('/api/analytics/track')) {
    let body = null
    try { body = await res.text() } catch {}
    responses.push({ url: res.url(), status: res.status(), body })
  }
})

console.log('--- Step 1: initial SSR load of tenant page ---')
await page.goto('http://demo.localhost:3000/', { waitUntil: 'networkidle' })

const cookies1 = await context.cookies('http://demo.localhost:3000/')
const visitorCookie = cookies1.find(c => c.name === 'kc_visitor_id')
const sessionCookie = cookies1.find(c => c.name === 'kc_session_id')
console.log('kc_visitor_id present:', !!visitorCookie, visitorCookie?.value)
console.log('kc_session_id present:', !!sessionCookie, sessionCookie?.value)
console.log('httpOnly visitor:', visitorCookie?.httpOnly, 'sameSite:', visitorCookie?.sameSite)
console.log('track requests after initial load (should be 0 — SSR records it, not client):', trackRequests.length)

console.log('\n--- Step 2: client-side SPA navigation ---')
trackRequests.length = 0
// find a same-origin nav link to click, fallback to direct router push via in-page click on NuxtLink
const aboutLinkExists = await page.locator('a[href="/about"]').count()
console.log('a[href="/about"] count:', aboutLinkExists)

if (aboutLinkExists > 0) {
  await page.locator('a[href="/about"]').first().click()
} else {
  // navigate via JS history (still SPA, triggers router.afterEach) by evaluating navigateTo if exposed, else direct goto as fallback
  await page.goto('http://demo.localhost:3000/about', { waitUntil: 'networkidle' })
}
await page.waitForTimeout(1500)
console.log('track requests fired after SPA nav to /about:', JSON.stringify(trackRequests, null, 2))
console.log('track responses:', JSON.stringify(responses, null, 2))

console.log('\n--- Step 3: another SPA nav to test duration ping + repeat tracking ---')
trackRequests.length = 0
responses.length = 0
const menuLinkExists = await page.locator('a[href="/menu"]').count()
console.log('a[href="/menu"] count:', menuLinkExists)
if (menuLinkExists > 0) {
  await page.locator('a[href="/menu"]').first().click()
  await page.waitForTimeout(1500)
} else {
  await page.goto('http://demo.localhost:3000/menu', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
}
console.log('track requests fired after 2nd SPA nav:', JSON.stringify(trackRequests, null, 2))
console.log('track responses:', JSON.stringify(responses, null, 2))

console.log('\n--- Step 4: visibilitychange duration ping ---')
trackRequests.length = 0
responses.length = 0
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
})
await page.waitForTimeout(1000)
console.log('track requests after visibilitychange hidden:', JSON.stringify(trackRequests, null, 2))

const cookies2 = await context.cookies('http://demo.localhost:3000/')
console.log('\nFinal cookies:', cookies2.filter(c => c.name.startsWith('kc_')))

await browser.close()
