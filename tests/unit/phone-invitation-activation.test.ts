import assert from 'node:assert/strict'
import test from 'node:test'
import { completeVerifiedInvitation } from '../../shared/auth/invitation-activation.ts'

test('verified phone identity accepts the invitation without fallback when successful', async () => {
  let accepted = false
  let fallbacks = 0
  await completeVerifiedInvitation({
    accept: async () => { accepted = true },
    isAccepted: () => accepted,
    fallback: () => { fallbacks++ },
  })
  assert.equal(accepted, true)
  assert.equal(fallbacks, 0)
})

test('verified phone identity reloads the invitation when the new session cookie is not yet usable', async () => {
  let accepted = false
  let fallbacks = 0
  await completeVerifiedInvitation({
    accept: async () => { accepted = true },
    isAccepted: () => false,
    fallback: () => { fallbacks++ },
  })
  assert.equal(accepted, true)
  assert.equal(fallbacks, 1)
})
