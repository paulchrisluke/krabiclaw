import { test } from '@playwright/test'

test('capture client-side error details with console logs', async ({ page }) => {
  test.setTimeout(60000)

  page.on('console', (message) => {
    console.log(`[BROWSER CONSOLE ${message.type().toUpperCase()}] ${message.text()}`)
  })

  page.on('pageerror', (error) => {
    console.log(`[BROWSER PAGEERROR] ${error.stack || error.message}`)
  })

  console.log('Navigating to production page...')
  await page.goto('/', { waitUntil: 'load' })
  
  console.log('Waiting 5 seconds for hydration crash to render error page...')
  await page.waitForTimeout(5000)
  
  const content = await page.content()
  if (content.includes('wrong link sando')) {
    console.log('--- ERROR PAGE LOADED ---')
    try {
      const errorText = await page.locator('div[style*="color: red"]').innerText()
      console.log('Extracted Error Details from page:')
      console.log(errorText)
    } catch (e) {
      console.log('Could not extract error text from page:', e instanceof Error ? e.message : String(e))
    }
  } else {
    console.log('Healthy! No error page rendered.')
  }
})
