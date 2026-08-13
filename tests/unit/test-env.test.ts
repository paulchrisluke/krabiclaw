import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  blawbyTestBaseUrl,
  blawbyTestExtraHeaders,
  kikuzukiTestBaseUrl,
  kikuzukiTestExtraHeaders,
  potteryHouseTestBaseUrl,
  potteryHouseTestExtraHeaders,
  tenantTestBaseUrl,
} from '../e2e/test-env.ts'

function withPreviewUrl(url: string, assertion: () => void) {
  const previousPreviewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
  process.env.PLAYWRIGHT_PREVIEW_URL = url
  try {
    assertion()
  } finally {
    if (previousPreviewUrl === undefined) delete process.env.PLAYWRIGHT_PREVIEW_URL
    else process.env.PLAYWRIGHT_PREVIEW_URL = previousPreviewUrl
  }
}

test('tenantTestBaseUrl passes the named local tunnel through unchanged', () => {
  withPreviewUrl('https://local.krabiclaw.com', () => {
    assert.equal(tenantTestBaseUrl(), 'https://local.krabiclaw.com')
  })
})

test('tenantTestBaseUrl still prefixes demo. for a production tenant host', () => {
  withPreviewUrl('https://pottery-house.krabiclaw.com', () => {
    assert.equal(tenantTestBaseUrl(), 'https://demo.pottery-house.krabiclaw.com')
  })
})

test('production paid-client helpers use exact canonical custom origins without preview headers', () => {
  withPreviewUrl('https://krabiclaw.com', () => {
    assert.deepEqual(
      [potteryHouseTestBaseUrl(), kikuzukiTestBaseUrl(), blawbyTestBaseUrl()],
      [
        'https://www.potteryhousekrabi.com',
        'https://www.kikuzuki-thailand.com',
        'https://www.northcarolinalegalservices.org',
      ],
    )
    assert.deepEqual(
      [potteryHouseTestExtraHeaders(), kikuzukiTestExtraHeaders(), blawbyTestExtraHeaders()],
      [{}, {}, {}],
    )
  })
})

test('local tunnel, preview, and staging stay on the shared origin with explicit tenant headers', () => {
  for (const origin of [
    'https://local.krabiclaw.com',
    'https://preview.krabiclaw.com',
    'https://krabiclaw-preview.paulchrisluke.workers.dev',
    'https://staging.krabiclaw.com',
  ]) {
    withPreviewUrl(origin, () => {
      assert.deepEqual(
        [potteryHouseTestBaseUrl(), kikuzukiTestBaseUrl(), blawbyTestBaseUrl()],
        [origin, origin, origin],
      )
      assert.deepEqual(
        [potteryHouseTestExtraHeaders(), kikuzukiTestExtraHeaders(), blawbyTestExtraHeaders()],
        [
          { 'x-preview-tenant': 'pottery-house', 'cache-control': 'no-store' },
          { 'x-preview-tenant': 'kikuzuki-krabi-thailand', 'cache-control': 'no-store' },
          { 'x-preview-tenant': 'ncls', 'cache-control': 'no-store' },
        ],
      )
    })
  }
})
