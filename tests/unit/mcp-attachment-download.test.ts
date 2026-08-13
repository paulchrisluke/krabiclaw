import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveUserUploadedMediaFile } from '../../server/utils/mcp-executor/shared.ts'

test('ChatGPT attachment downloads reject redirects without a second network attempt', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string, redirect: RequestRedirect | undefined }> = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), redirect: init?.redirect })
    return new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/internal' },
    })
  }

  try {
    await assert.rejects(
      () => resolveUserUploadedMediaFile({
        download_url: 'https://files.example.test/attachment',
        file_id: 'file-1',
      }),
      /Failed to download attachment file-1: 302/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.deepEqual(calls, [{
    url: 'https://files.example.test/attachment',
    redirect: 'manual',
  }])
})

test('ChatGPT attachment download failures identify the attachment without retrying', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new TypeError('fetch failed')
  }

  try {
    await assert.rejects(
      () => resolveUserUploadedMediaFile({
        download_url: 'https://files.example.test/attachment',
        file_id: 'file-network-error',
      }),
      /Failed to download attachment file-network-error: fetch failed/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(calls, 1)
})

test('ChatGPT attachment downloads allocate the declared payload once', async () => {
  const originalFetch = globalThis.fetch
  const video = new Uint8Array(64)
  video.set([0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 4)
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(video, {
      headers: {
        'content-length': String(video.byteLength),
        'content-type': 'video/mp4',
      },
    })
  }

  try {
    const resolved = await resolveUserUploadedMediaFile({
      download_url: 'https://files.example.test/video',
      file_id: 'file-video',
      mime_type: 'video/mp4',
      file_name: 'video.mp4',
    })
    assert.equal(resolved.kind, 'video')
    assert.equal(resolved.buffer.byteLength, video.byteLength)
    assert.equal(resolved.buffer.buffer.byteLength, video.byteLength)
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(calls, 1)
})

test('ChatGPT attachment downloads shrink an undeclared payload to its exact size', async () => {
  const originalFetch = globalThis.fetch
  const video = new Uint8Array(64)
  video.set([0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 4)
  globalThis.fetch = async () => new Response(video, {
    headers: { 'content-type': 'video/mp4' },
  })

  try {
    const resolved = await resolveUserUploadedMediaFile({
      download_url: 'https://files.example.test/video',
      file_id: 'file-video-without-length',
      mime_type: 'video/mp4',
      file_name: 'video.mp4',
    })
    assert.equal(resolved.buffer.byteLength, video.byteLength)
    assert.equal(resolved.buffer.buffer.byteLength, video.byteLength)
  } finally {
    globalThis.fetch = originalFetch
  }
})
