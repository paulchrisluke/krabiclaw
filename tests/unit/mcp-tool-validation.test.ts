import assert from 'node:assert/strict'
import test from 'node:test'

import { validateNoUnknownTopLevelArguments } from '../../server/utils/mcp-tool-validation.ts'
import { MCP_ERROR } from '../../server/utils/mcp-protocol.ts'
import { PLATFORM_MCP_TOOLS } from '../../server/utils/platform-mcp-tools.ts'
import { BLOG_TOOLS } from '../../server/utils/mcp-tools/blog.ts'

type ToolContract = {
  name: string
  inputSchema: Record<string, unknown>
}

function tool(tools: readonly unknown[], name: string): ToolContract {
  const definition = (tools as readonly ToolContract[]).find(candidate => candidate.name === name)
  assert.ok(definition, `missing ${name}`)
  return definition
}

// Asserts both the message content and the MCP error code, so these tests
// keep failing correctly if validateNoUnknownTopLevelArguments ever stops
// throwing MCP_ERROR.invalidParams specifically (e.g. a refactor that starts
// throwing a generic Error with a similar message would slip past a
// message-only check).
function isInvalidParamsErrorContaining(text: string) {
  return (error: unknown) =>
    error instanceof Error
    && error.message.includes(text)
    && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.invalidParams
}

test('validateNoUnknownTopLevelArguments rejects the exact 2026-07-22 incident payload', () => {
  const updatePost = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_post')
  assert.throws(
    () => validateNoUnknownTopLevelArguments(updatePost.inputSchema, {
      post_id: '7593c000-12cf-4ed4-ad06-e3ce3b73c4a7',
      title: 'Can AI Really Manage My Restaurant Website?',
      body: 'markdown content that was silently dropped',
      excerpt: 'excerpt',
      category: 'Marketing',
      seo_description: 'seo',
      seo_keywords: 'seo',
      robots: 'index,follow',
    }),
    isInvalidParamsErrorContaining('body'),
  )
})

test('validateNoUnknownTopLevelArguments accepts a valid content_blocks update', () => {
  const updatePost = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_post')
  assert.doesNotThrow(() => validateNoUnknownTopLevelArguments(updatePost.inputSchema, {
    post_id: 'post-1',
    content_blocks: [{ type: 'markdown', data: { markdown: 'Hello' } }],
  }))
})

test('validateNoUnknownTopLevelArguments accepts an SEO-only partial update with no content_blocks', () => {
  const updatePost = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_post')
  assert.doesNotThrow(() => validateNoUnknownTopLevelArguments(updatePost.inputSchema, {
    post_id: 'post-1',
    seo_description: 'Updated description only.',
  }))
})

test('validateNoUnknownTopLevelArguments accepts a minimal publish call', () => {
  const publishPost = tool(PLATFORM_MCP_TOOLS, 'publish_platform_blog_post')
  assert.doesNotThrow(() => validateNoUnknownTopLevelArguments(publishPost.inputSchema, {
    post_id: 'post-1',
  }))
})

test('validateNoUnknownTopLevelArguments is a no-op for schemas without additionalProperties: false', () => {
  assert.doesNotThrow(() => validateNoUnknownTopLevelArguments(
    { type: 'object', properties: { post_id: { type: 'string' } } },
    { post_id: 'post-1', anything_else: 'passes through unchanged' },
  ))
})

test('validateNoUnknownTopLevelArguments sorts multiple unknown keys deterministically', () => {
  assert.throws(
    () => validateNoUnknownTopLevelArguments(
      { type: 'object', additionalProperties: false, properties: { post_id: { type: 'string' } } },
      { post_id: 'post-1', zeta: 1, alpha: 2 },
    ),
    (error: unknown) => error instanceof Error && error.message === 'Unknown arguments: alpha, zeta' && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.invalidParams,
  )
})

test('the tenant update_blog_post/create_blog_post schemas are strict (regression: siteTool() defaulted to additionalProperties: true, making tenant validation a no-op)', () => {
  const updateBlogPost = tool(BLOG_TOOLS, 'update_blog_post')
  assert.equal(updateBlogPost.inputSchema.additionalProperties, false)
  const createBlogPost = tool(BLOG_TOOLS, 'create_blog_post')
  assert.equal(createBlogPost.inputSchema.additionalProperties, false)
})

test('validateNoUnknownTopLevelArguments rejects the tenant incident shape: update_blog_post called with body instead of content_blocks', () => {
  const updateBlogPost = tool(BLOG_TOOLS, 'update_blog_post')
  assert.throws(
    () => validateNoUnknownTopLevelArguments(updateBlogPost.inputSchema, {
      site_id: 'site-1',
      post_id: 'post-1',
      expected_document_updated_at: '2026-07-22T00:00:00.000Z',
      body: 'This should never be persisted.',
    }),
    isInvalidParamsErrorContaining('body'),
  )
})

test('validateNoUnknownTopLevelArguments accepts a valid tenant update_blog_post call', () => {
  const updateBlogPost = tool(BLOG_TOOLS, 'update_blog_post')
  assert.doesNotThrow(() => validateNoUnknownTopLevelArguments(updateBlogPost.inputSchema, {
    site_id: 'site-1',
    post_id: 'post-1',
    expected_document_updated_at: '2026-07-22T00:00:00.000Z',
    content_blocks: [{ type: 'markdown', data: { markdown: 'Hello' } }],
  }))
})

test('validateNoUnknownTopLevelArguments rejects prototype property names as unknown args, not treats them as allowed', () => {
  // A naive `key in properties` check would incorrectly treat `constructor`/`toString`
  // as allowed (they're inherited from Object.prototype), even though the schema
  // never declared them. Object.keys()-based allow/reject lists must not have that gap.
  assert.throws(
    () => validateNoUnknownTopLevelArguments(
      { type: 'object', additionalProperties: false, properties: { post_id: { type: 'string' } } },
      { post_id: 'post-1', constructor: 'unexpected' },
    ),
    isInvalidParamsErrorContaining('constructor'),
  )
})
