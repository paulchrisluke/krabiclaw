import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPublicMediaUrl } from '../../server/utils/public-media-verification.ts'

test('assertPublicMediaUrl retries transient 404s before succeeding', async () => {
  let attempts = 0

  await assert.doesNotReject(async () => {
    await assertPublicMediaUrl('https://media.example.test/video.mp4', 'video/mp4', {
      fetchImpl: async () => {
        attempts += 1

        if (attempts < 3) {
          return new Response('', { status: 404 })
        }

        return new Response('', {
          status: 206,
          headers: { 'content-type': 'video/mp4' },
        })
      },
      retryDelaysMs: [0, 0],
      sleepImpl: async () => {},
    })
  })

  assert.equal(attempts, 3)
})

test('assertPublicMediaUrl fails immediately on content-type mismatch', async () => {
  let attempts = 0

  await assert.rejects(
    () => assertPublicMediaUrl('https://media.example.test/video.mp4', 'video/mp4', {
      fetchImpl: async () => {
        attempts += 1
        return new Response('', {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        })
      },
      retryDelaysMs: [0, 0, 0],
      sleepImpl: async () => {},
    }),
    /expected video\/mp4/,
  )

  assert.equal(attempts, 1)
})
