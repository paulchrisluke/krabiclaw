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

test('local tunnel and raw workers.dev hosts stay shared with explicit tenant headers', () => {
  for (const origin of [
    'https://local.krabiclaw.com',
    'https://krabiclaw-preview.paulchrisluke.workers.dev',
  ]) {
    withPreviewUrl(origin, () => {
      assert.deepEqual(
        [potteryHouseTestBaseUrl(), kikuzukiTestBaseUrl(), blawbyTestBaseUrl()],
        [origin, origin, origin],
      )
      assert.deepEqual(
        [potteryHouseTestExtraHeaders(), kikuzukiTestExtraHeaders(), blawbyTestExtraHeaders()],
        [
          { 'x-preview-tenant': 'pottery-house' },
          { 'x-preview-tenant': 'kikuzuki-krabi-thailand' },
          { 'x-preview-tenant': 'ncls' },
        ],
      )
    })
  }
})

test('deployed preview, staging, and E2E lanes use direct tenant aliases without headers', () => {
  for (const [origin, environment] of [
    ['https://preview.krabiclaw.com', 'preview'],
    ['https://staging.krabiclaw.com', 'staging'],
    ['https://e2e-2.krabiclaw.com', 'e2e-2'],
  ]) {
    withPreviewUrl(origin, () => {
      assert.equal(tenantTestBaseUrl(), `https://demo-${environment}.krabiclaw.com`)
      assert.deepEqual(
        [potteryHouseTestBaseUrl(), kikuzukiTestBaseUrl(), blawbyTestBaseUrl()],
        [
          `https://pottery-house-${environment}.krabiclaw.com`,
          `https://kikuzuki-krabi-thailand-${environment}.krabiclaw.com`,
          `https://ncls-${environment}.krabiclaw.com`,
        ],
      )
      assert.deepEqual(
        [potteryHouseTestExtraHeaders(), kikuzukiTestExtraHeaders(), blawbyTestExtraHeaders()],
        [{}, {}, {}],
      )
    })
  }
})
