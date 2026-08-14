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

test('shared blog creation rejects every lifecycle field before DB lookup', async () => {
  const { createPlatformBlogPost } = await import('../../server/utils/platform-content.ts')
  for (const field of ['publish', 'unpublish', 'scheduled_for']) {
    await assert.rejects(
      () => createPlatformBlogPost(
        {} as D1Database,
        'author-1',
        {
          title: 'Draft only',
          content_blocks: [{ type: 'markdown', data: { markdown: 'Draft body', editor_mode: 'rich' } }],
          [field]: field === 'scheduled_for' ? '2099-01-01T00:00:00Z' : true,
        },
        { site_id: 'site-1', organization_id: 'org-1' },
      ),
      (error: unknown) => error instanceof Error
        && error.message.includes(`${field} is not writable when creating a blog post`)
        && (error as { statusCode?: number }).statusCode === 400,
    )
  }
})

test('blog editor theme tokens default only when absent and reject corrupt stored values', async () => {
  const { parseBlogEditorThemeTokens } = await import('../../server/utils/platform-content.ts')
  assert.deepEqual(parseBlogEditorThemeTokens(null), {})
  assert.deepEqual(parseBlogEditorThemeTokens(undefined), {})
  assert.deepEqual(parseBlogEditorThemeTokens('{"brand":{"accent":"#123456"}}'), {
    brand: { accent: '#123456' },
  })

  for (const value of ['', 'not-json', '[]', 'null', '"theme"']) {
    assert.throws(
      () => parseBlogEditorThemeTokens(value),
      (error: unknown) => error instanceof Error && (error as { statusCode?: number }).statusCode === 500,
      `expected ${JSON.stringify(value)} to fail closed`,
    )
  }
})
