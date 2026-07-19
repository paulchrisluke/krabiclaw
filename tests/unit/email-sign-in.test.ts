import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresEmailVerification } from '../../shared/auth/email-sign-in.ts'

test('email verification recovery uses the stable Better Auth error code', () => {
  assert.equal(requiresEmailVerification({ code: 'EMAIL_NOT_VERIFIED', message: 'Sign in unavailable' }), true)
  assert.equal(requiresEmailVerification({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Email is not verified' }), false)
  assert.equal(requiresEmailVerification(null), false)
})
