import assert from 'node:assert/strict'
import test from 'node:test'

Object.assign(globalThis, {
  createError(input: { statusCode: number; statusMessage: string }) {
    return Object.assign(new Error(input.statusMessage), input)
  },
})

test('shared blog updater rejects calls with only concurrency tokens before DB lookup', async () => {
  const { updatePlatformBlogPost } = await import('../../server/utils/platform-content.ts')
  await assert.rejects(
    () => updatePlatformBlogPost(
      {} as D1Database,
      'post-1',
      {
        expected_updated_at: '2026-07-23T00:00:00.000Z',
        expected_document_updated_at: '2026-07-23T00:00:00.000Z',
      },
      'site-1',
    ),
    (error: unknown) =>
      error instanceof Error
      && error.message.includes('At least one blog mutation field is required')
      && (error as { statusCode?: number }).statusCode === 400,
  )
})
