import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReplyLocalPart,
  buildReplyToken,
  parseReplyLocalPart,
  verifyReplyTokenValue,
  type ReplySubmissionType,
} from '../../server/utils/reply-address.ts'

const secret = 'test-secret'
const submissionId = '8a5aa1bf-b904-4c8f-b632-3b60162c8a01'

test('compact reply local part stays under 64 characters and round-trips', async () => {
  const token = await buildReplyToken(secret, 'reservation', submissionId)
  const local = buildReplyLocalPart('reservation', submissionId, token)

  if (local === null) {
    throw new Error('Expected compact local part')
  }
  assert(local.length < 64)

  const parsed = parseReplyLocalPart(local)
  assert.deepEqual(parsed, {
    submissionType: 'reservation',
    submissionId,
    token,
  })
})

test('verifyReplyTokenValue accepts the compact token format', async () => {
  const token = await buildReplyToken(secret, 'experience_booking', submissionId)
  const ok = await verifyReplyTokenValue(secret, 'experience_booking', submissionId, token)
  assert.equal(ok, true)
})

test('parseReplyLocalPart remains backward compatible with legacy reply+ addresses', () => {
  const legacyToken = 'a'.repeat(32)
  const legacy = `reply+contact-${submissionId}-${legacyToken}`
  const parsed = parseReplyLocalPart(legacy)

  assert.deepEqual(parsed, {
    submissionType: 'contact' satisfies ReplySubmissionType,
    submissionId,
    token: legacyToken,
  })
})
