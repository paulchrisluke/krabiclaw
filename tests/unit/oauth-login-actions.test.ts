import assert from 'node:assert/strict'
import test from 'node:test'
import { googleSignInOptions, oauthContinuationDestination } from '../../shared/auth/oauth-login.ts'

test('OAuth provider login creates a session without a manual callback URL', () => {
  assert.deepEqual(googleSignInOptions(), { provider: 'google' })
  assert.deepEqual(googleSignInOptions('/api/post-login'), { provider: 'google', callbackURL: '/api/post-login' })
})

test('typed account-selection continuation exposes the provider redirect', () => {
  assert.equal(oauthContinuationDestination({ url: 'https://client.example/callback' }), 'https://client.example/callback')
  assert.equal(oauthContinuationDestination({ redirect_uri: 'https://client.example/other' }), 'https://client.example/other')
  assert.equal(oauthContinuationDestination(null), '')
})
