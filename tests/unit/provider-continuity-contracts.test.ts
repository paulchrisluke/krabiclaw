import { createHmac } from 'node:crypto'
import { buildReplyToAddress, parseReplyToAddress, verifyReplyToken } from '../../server/utils/submission-messages.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('compact reply contract preserves its signature and configured domain', async () => {
  const env = { EMAIL_REPLY_SECRET: 'reply-contract-test-key', NUXT_PUBLIC_PLATFORM_DOMAIN: 'example.com' }
  const id = '00000000-0000-4000-8000-000000000123'
  const token = createHmac('sha256', env.EMAIL_REPLY_SECRET).update(`reservation:${id}`).digest('hex').slice(0, 24)
  const address = await buildReplyToAddress(env, 'reservation', id)
  assert.equal(address, `rr${id.replaceAll('-', '')}${token}@reply.example.com`)
  assert.ok(address)
  assert.deepEqual(parseReplyToAddress(env, address), { submissionType: 'reservation', submissionId: id, token })
  assert.equal(await verifyReplyToken(env, 'reservation', id, token), true)
  assert.equal(await verifyReplyToken(env, 'contact', id, token), false)
  assert.equal(await verifyReplyToken(env, 'reservation', `${id.slice(0, -1)}4`, token), false)
  assert.equal(parseReplyToAddress(env, address.replace('@reply.example.com', '@other.example.com')), null)
  assert.equal(parseReplyToAddress(env, `${address}@reply.example.com`), null)
})
