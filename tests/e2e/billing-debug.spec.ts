import { test } from '@playwright/test'

test('debug billing checkout 500', async ({ page, request }) => {
  test.setTimeout(60_000)

  // Step 1: dev login to get a session cookie
  console.log('→ Dev login...')
  const loginRes = await page.goto('/api/dev/login', { waitUntil: 'networkidle' })
  console.log('  Login status:', loginRes?.status(), loginRes?.url())

  const cookies = await page.context().cookies()
  console.log('  Cookies set:', cookies.map(c => c.name).join(', '))

  // Step 2: fetch the checkout endpoint directly, capturing network + response body
  console.log('\n→ POST /api/billing/checkout...')
  const response = await page.evaluate(async () => {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'growth', interval: 'month' }),
      credentials: 'include',
    })
    const body = await res.text()
    return { status: res.status, body }
  })

  console.log('  Status:', response.status)
  console.log('  Body:', response.body)

  // Step 3: also hit the plans endpoint to check Stripe product seeding
  console.log('\n→ GET /api/billing/plans...')
  const plansRes = await page.evaluate(async () => {
    const res = await fetch('/api/billing/plans', { credentials: 'include' })
    const body = await res.text()
    return { status: res.status, body }
  })
  console.log('  Status:', plansRes.status)
  console.log('  Body:', plansRes.body)
})
