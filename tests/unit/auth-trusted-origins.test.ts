import assert from 'node:assert/strict'
import test from 'node:test'
import { localDevelopmentOrigin } from '../../server/utils/auth'

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
