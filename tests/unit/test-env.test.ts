import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tenantTestBaseUrl } from '../e2e/test-env.ts'

test('tenantTestBaseUrl passes the named local tunnel through unchanged', () => {
  const previousPreviewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
  process.env.PLAYWRIGHT_PREVIEW_URL = 'https://local.krabiclaw.com'
  try {
    assert.equal(tenantTestBaseUrl(), 'https://local.krabiclaw.com')
  } finally {
    if (previousPreviewUrl === undefined) delete process.env.PLAYWRIGHT_PREVIEW_URL
    else process.env.PLAYWRIGHT_PREVIEW_URL = previousPreviewUrl
  }
})

test('tenantTestBaseUrl still prefixes demo. for a production tenant host', () => {
  const previousPreviewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
  process.env.PLAYWRIGHT_PREVIEW_URL = 'https://pottery-house.krabiclaw.com'
  try {
    assert.equal(tenantTestBaseUrl(), 'https://demo.pottery-house.krabiclaw.com')
  } finally {
    if (previousPreviewUrl === undefined) delete process.env.PLAYWRIGHT_PREVIEW_URL
    else process.env.PLAYWRIGHT_PREVIEW_URL = previousPreviewUrl
  }
})
