import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeployedWorkerTarget, isQuickTunnelHost, tenantTestBaseUrl } from '../e2e/test-env.ts'

test('isQuickTunnelHost matches trycloudflare.com quick tunnel hostnames', () => {
  assert.equal(isQuickTunnelHost('sum-polished-workshop-carter.trycloudflare.com'), true)
  assert.equal(isQuickTunnelHost('a.trycloudflare.com'), true)
})

test('isQuickTunnelHost rejects non-quick-tunnel hostnames', () => {
  assert.equal(isQuickTunnelHost('localhost'), false)
  assert.equal(isQuickTunnelHost('preview.krabiclaw.com'), false)
  assert.equal(isQuickTunnelHost('staging.krabiclaw.com'), false)
  assert.equal(isQuickTunnelHost('krabiclaw.com'), false)
  assert.equal(isQuickTunnelHost('local.krabiclaw.com'), false)
  // Must not match a lookalike host that merely contains the suffix elsewhere.
  assert.equal(isQuickTunnelHost('trycloudflare.com.evil.example'), false)
})

test('isDeployedWorkerTarget is true for preview/staging, false for quick tunnels and localhost', () => {
  assert.equal(isDeployedWorkerTarget('https://preview.krabiclaw.com'), true)
  assert.equal(isDeployedWorkerTarget('https://staging.krabiclaw.com'), true)
  assert.equal(isDeployedWorkerTarget('https://foo-bar.trycloudflare.com'), false)
  assert.equal(isDeployedWorkerTarget('http://localhost:3000'), false)
})

test('tenantTestBaseUrl passes a quick tunnel host through unchanged (no demo. prefix)', () => {
  process.env.PLAYWRIGHT_PREVIEW_URL = 'https://sum-polished-workshop-carter.trycloudflare.com'
  try {
    assert.equal(tenantTestBaseUrl(), 'https://sum-polished-workshop-carter.trycloudflare.com')
  } finally {
    delete process.env.PLAYWRIGHT_PREVIEW_URL
  }
})

test('tenantTestBaseUrl still prefixes demo. for a non-quick-tunnel, non-preview host', () => {
  process.env.PLAYWRIGHT_PREVIEW_URL = 'https://pottery-house.krabiclaw.com'
  try {
    assert.equal(tenantTestBaseUrl(), 'https://demo.pottery-house.krabiclaw.com')
  } finally {
    delete process.env.PLAYWRIGHT_PREVIEW_URL
  }
})
