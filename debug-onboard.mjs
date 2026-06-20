import { chromium } from 'playwright'

const baseURL = 'http://localhost:3000'
const userId = `e2e-debug-${Date.now()}`

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

page.on('console', msg => console.log('[console]', msg.type(), msg.text()))
page.on('pageerror', err => console.log('[pageerror]', err.message))
page.on('request', req => { if (req.url().includes('/api/')) console.log('[req]', req.method(), req.url()) })
page.on('response', res => { if (res.url().includes('/api/')) console.log('[res]', res.status(), res.url()) })

await page.request.get(`${baseURL}/api/dev/login?userId=${userId}`, { maxRedirects: 0 })
await page.goto(`${baseURL}/dashboard/onboarding`, { waitUntil: 'load' })

await page.getByRole('button', { name: 'Start building' }).click()
await page.getByRole('button', { name: /Restaurant, café or bar/ }).click()
await page.getByRole('button', { name: /Start manually/ }).click()
const input = page.getByPlaceholder('Your business name…')
await input.fill(`Debug Cafe ${Date.now()}`)
console.log('--- pressing Enter ---')
await input.press('Enter')
await page.waitForTimeout(6000)
console.log('--- after wait, url:', page.url())
console.log('--- body text snippet ---')
console.log((await page.locator('body').innerText()).slice(0, 1500))
await page.screenshot({ path: '/tmp/debug-onboard.png' })

await browser.close()
