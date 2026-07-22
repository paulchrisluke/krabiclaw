import assert from 'node:assert/strict'
import test from 'node:test'

import { validateNoUnknownTopLevelArguments } from '../../server/utils/mcp-tool-validation.ts'
import { PLATFORM_MCP_TOOLS } from '../../server/utils/platform-mcp-tools.ts'

type ToolContract = {
  name: string
  inputSchema: Record<string, unknown>
}

function tool(tools: readonly unknown[], name: string): ToolContract {
  const definition = (tools as readonly ToolContract[]).find(candidate => candidate.name === name)
  assert.ok(definition, `missing ${name}`)
  return definition
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
    (error: unknown) => error instanceof Error && error.message.includes('body'),
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
    (error: unknown) => error instanceof Error && error.message === 'Unknown arguments: alpha, zeta',
  )
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
    (error: unknown) => error instanceof Error && error.message.includes('constructor'),
  )
})
