import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLoginUrl, buildPostLoginUrl, validatedInternalPath } from '../../shared/auth/return-target.ts'

test('ordinary authentication routes valid internal destinations through post-login', () => {
  assert.equal(validatedInternalPath('/transfer/abc?step=accept#details'), '/transfer/abc?step=accept#details')
  assert.equal(buildPostLoginUrl({ redirect: '/transfer/abc' }), '/api/post-login?redirect=%2Ftransfer%2Fabc')
  assert.equal(buildPostLoginUrl(), '/api/post-login')
})

test('transfer email authentication preserves its original token route', () => {
  assert.equal(buildLoginUrl({ redirect: '/transfer/token-123' }), '/login?redirect=%2Ftransfer%2Ftoken-123')
})

test('ordinary authentication rejects external and ambiguous destinations', () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'dashboard', '']) {
    assert.equal(validatedInternalPath(value), undefined)
  }
  assert.equal(buildPostLoginUrl({ redirect: '//evil.example' }), '/api/post-login')
})
