import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tenantTestBaseUrl } from '../e2e/test-env.ts'

test('tenantTestBaseUrl passes the named local tunnel through unchanged', () => {
  process.env.PLAYWRIGHT_PREVIEW_URL = 'https://local.krabiclaw.com'
  try {
    assert.equal(tenantTestBaseUrl(), 'https://local.krabiclaw.com')
  } finally {
    delete process.env.PLAYWRIGHT_PREVIEW_URL
  }
})

test('tenantTestBaseUrl still prefixes demo. for a production tenant host', () => {
  process.env.PLAYWRIGHT_PREVIEW_URL = 'https://pottery-house.krabiclaw.com'
  try {
    assert.equal(tenantTestBaseUrl(), 'https://demo.pottery-house.krabiclaw.com')
  } finally {
    delete process.env.PLAYWRIGHT_PREVIEW_URL
  }
})
