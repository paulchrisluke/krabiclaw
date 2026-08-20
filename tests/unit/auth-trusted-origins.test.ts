import assert from 'node:assert/strict'
import test from 'node:test'
import { localDevelopmentOrigin, shouldBypassE2eAuthRateLimit } from '../../server/utils/auth'

test('accepts loopback HTTP origins on arbitrary development ports', () => {
  assert.equal(localDevelopmentOrigin('http://127.0.0.1:3001'), 'http://127.0.0.1:3001')
  assert.equal(localDevelopmentOrigin('http://localhost:4173/'), 'http://localhost:4173')
  assert.equal(localDevelopmentOrigin('http://[::1]:3001'), 'http://[::1]:3001')
})

test('rejects non-loopback and HTTPS origins', () => {
  assert.equal(localDevelopmentOrigin('https://127.0.0.1:3001'), null)
  assert.equal(localDevelopmentOrigin('http://example.com:3001'), null)
  assert.equal(localDevelopmentOrigin('not a URL'), null)
})

test('E2E auth rate-limit bypass requires the enabled environment and matching secret', () => {
  const request = (secret?: string) => new Request('https://staging.krabiclaw.com/api/auth/sign-in/email', {
    headers: secret ? { 'x-dev-route-secret': secret } : {},
  })

  assert.equal(shouldBypassE2eAuthRateLimit({}, request('expected')), false)
  assert.equal(shouldBypassE2eAuthRateLimit({ E2E_ALLOW_DEV_ROUTES: 'true' }, request('expected')), false)
  assert.equal(shouldBypassE2eAuthRateLimit({
    E2E_ALLOW_DEV_ROUTES: 'true',
    E2E_DEV_ROUTE_SECRET: 'expected',
  }, request()), false)
  assert.equal(shouldBypassE2eAuthRateLimit({
    E2E_ALLOW_DEV_ROUTES: 'true',
    E2E_DEV_ROUTE_SECRET: 'expected',
  }, request('wrong')), false)
  assert.equal(shouldBypassE2eAuthRateLimit({
    E2E_ALLOW_DEV_ROUTES: 'true',
    E2E_DEV_ROUTE_SECRET: 'expected',
  }, request('expected')), true)
})
