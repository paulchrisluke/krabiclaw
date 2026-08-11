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
