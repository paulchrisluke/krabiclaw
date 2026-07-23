import assert from 'node:assert/strict'
import test from 'node:test'

import { handleBlogTools } from '../../server/utils/mcp-executor/blog.ts'
import { MCP_ERROR } from '../../server/utils/mcp-protocol.ts'

function invalidParamsContaining(text: string) {
  return (error: unknown) =>
    error instanceof Error
    && error.message.includes(text)
    && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.invalidParams
}

function ctx(toolName: string, args: Record<string, unknown>) {
  return {
    toolName,
    args,
    site: {
      db: {},
      siteId: 'site-1',
      organizationId: 'org-1',
      userId: 'user-1',
      env: {},
    },
  } as Parameters<typeof handleBlogTools>[0]
}

test('tenant update_blog_post rejects a no-op before touching the backend', async () => {
  await assert.rejects(
    () => handleBlogTools(ctx('update_blog_post', { site_id: 'site-1', post_id: 'post-1' })),
    invalidParamsContaining('At least one blog mutation field is required.'),
  )
})

test('tenant update_blog_metadata rejects a no-op before touching the backend', async () => {
  await assert.rejects(
    () => handleBlogTools(ctx('update_blog_metadata', { site_id: 'site-1', post_id: 'post-1', expected_updated_at: '2026-07-23T00:00:00.000Z' })),
    invalidParamsContaining('At least one blog metadata field is required.'),
  )
})

test('tenant replace_blog_content rejects a missing document concurrency token before touching the backend', async () => {
  await assert.rejects(
    () => handleBlogTools(ctx('replace_blog_content', {
      site_id: 'site-1',
      post_id: 'post-1',
      content_blocks: [{ type: 'markdown', data: { markdown: 'Updated.' } }],
    })),
    invalidParamsContaining('Invalid expected_document_updated_at'),
  )
})
