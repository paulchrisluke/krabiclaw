import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteImage } from '../../server/utils/cloudflare-images.ts'

const env = {
  CF_ACCOUNT_ID: 'account-id',
  CLOUDFLARE_IMAGES_API_TOKEN: 'token',
  CLOUDFLARE_IMAGES_VARIANT_BASE: 'https://imagedelivery.test/account',
}

test('Cloudflare Images deletion is one idempotent request', async (t) => {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    requests += 1
    assert.ok(init?.signal instanceof AbortSignal)
    return new Response('not found', { status: 404 })
  })

  await deleteImage(env, 'already-deleted-image')
  assert.equal(requests, 1)
})

test('Cloudflare Images deletion preserves provider errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('provider unavailable', { status: 503 }))
  await assert.rejects(
    () => deleteImage(env, 'failed-image'),
    /CF Images delete error 503: provider unavailable/,
  )
})
