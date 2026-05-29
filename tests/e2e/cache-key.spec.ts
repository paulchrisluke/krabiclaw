import { test, expect } from '@playwright/test'
import { testBaseUrl } from './test-env'

// Simple integration test ensuring Cloudflare cache key respects hostname
// Requests two distinct hostnames and asserts the HTML responses differ.
// This test assumes local hosts or DNS are configured for demo.<host> and pottery-house.<host>.

test('cache key includes hostname (demo vs pottery-house)', async ({ request }) => {
  const base = new URL(testBaseUrl())
  const hostA = `demo.${base.hostname}`
  const hostB = `pottery-house.${base.hostname}`

  const urlA = new URL(base.toString())
  urlA.hostname = hostA
  const urlB = new URL(base.toString())
  urlB.hostname = hostB

  const resA = await request.get(urlA.toString())
  const resB = await request.get(urlB.toString())

  expect(resA.status()).toBe(200)
  expect(resB.status()).toBe(200)

  const textA = await resA.text()
  const textB = await resB.text()

  // Basic assertion: HTML bodies should not be identical across tenant hostnames
  expect(textA).not.toBe(textB)
})
