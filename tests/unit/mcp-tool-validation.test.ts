import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { validateNoUnknownTopLevelArguments } from '../../server/utils/mcp-tool-validation.ts'
import { MCP_ERROR } from '../../server/utils/mcp-protocol.ts'
import { PLATFORM_INTERNAL_MCP_TOOLS, PLATFORM_MCP_TOOLS, PLATFORM_PUBLIC_MCP_TOOLS } from '../../server/utils/platform-mcp-tools.ts'
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

test('validateNoUnknownTopLevelArguments rejects the exact 2026-07-22 incident payload against the new metadata tool', () => {
  const metadataTool = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_metadata')
  assert.throws(
    () => validateNoUnknownTopLevelArguments(metadataTool.inputSchema, {
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

test('validateNoUnknownTopLevelArguments accepts a valid replace_platform_blog_content call', () => {
  const contentTool = tool(PLATFORM_MCP_TOOLS, 'replace_platform_blog_content')
  assert.doesNotThrow(() => validateNoUnknownTopLevelArguments(contentTool.inputSchema, {
    post_id: 'post-1',
    expected_document_updated_at: '2026-07-22T00:00:00.000Z',
    content_blocks: [{ type: 'markdown', data: { markdown: 'Hello' } }],
  }))
})

test('validateNoUnknownTopLevelArguments accepts a metadata-only update_platform_blog_metadata call', () => {
  const metadataTool = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_metadata')
  assert.doesNotThrow(() => validateNoUnknownTopLevelArguments(metadataTool.inputSchema, {
    post_id: 'post-1',
    expected_updated_at: '2026-07-22T00:00:00.000Z',
    seo_description: 'Updated description only.',
  }))
})

test('update_platform_blog_post is gone: absent from both PLATFORM_PUBLIC_MCP_TOOLS and the combined PLATFORM_MCP_TOOLS', () => {
  assert.equal(PLATFORM_MCP_TOOLS.some(t => t.name === 'update_platform_blog_post'), false)
  assert.equal(PLATFORM_PUBLIC_MCP_TOOLS.some(t => t.name === 'update_platform_blog_post'), false)
})

test('update_platform_blog_metadata requires expected_updated_at and at least one metadata field beyond it', () => {
  const metadataTool = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_metadata')
  assert.ok((metadataTool.inputSchema.required as string[]).includes('expected_updated_at'))
  assert.ok((metadataTool.inputSchema.required as string[]).includes('post_id'))
})

test('replace_platform_blog_content requires content_blocks and expected_document_updated_at, with minItems: 1', () => {
  const contentTool = tool(PLATFORM_MCP_TOOLS, 'replace_platform_blog_content')
  const required = contentTool.inputSchema.required as string[]
  assert.ok(required.includes('content_blocks'))
  assert.ok(required.includes('expected_document_updated_at'))
  const properties = contentTool.inputSchema.properties as Record<string, { minItems?: number }>
  assert.equal(properties.content_blocks?.minItems, 1)
})

test('create_platform_blog_post requires a non-empty content_blocks array', () => {
  const createTool = tool(PLATFORM_MCP_TOOLS, 'create_platform_blog_post')
  const properties = createTool.inputSchema.properties as Record<string, { minItems?: number }>
  assert.equal(properties.content_blocks?.minItems, 1)
})

test('PLATFORM_PUBLIC_MCP_TOOLS and PLATFORM_INTERNAL_MCP_TOOLS are disjoint and together form PLATFORM_MCP_TOOLS', () => {
  const publicNames = new Set(PLATFORM_PUBLIC_MCP_TOOLS.map(t => t.name))
  const internalNames = new Set(PLATFORM_INTERNAL_MCP_TOOLS.map(t => t.name))
  for (const name of internalNames) assert.equal(publicNames.has(name), false, `${name} should not be in both registries`)
  assert.equal(PLATFORM_MCP_TOOLS.length, PLATFORM_PUBLIC_MCP_TOOLS.length + PLATFORM_INTERNAL_MCP_TOOLS.length)
  for (const name of ['get_content_document_outline', 'get_content_block', 'append_content_block', 'replace_content_block', 'delete_content_block', 'render_content_preview', 'publish_content_revision']) {
    assert.ok(internalNames.has(name), `${name} should be internal`)
  }
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
  for (const name of ['create_blog_post', 'update_blog_post', 'update_blog_metadata', 'replace_blog_content']) {
    const definition = tool(BLOG_TOOLS, name)
    assert.equal(definition.inputSchema.additionalProperties, false, `${name} should reject unknown top-level arguments`)
  }
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

test('tenant blog schemas support seo_keywords wherever tenant prompts ask for it', () => {
  for (const name of ['create_blog_post', 'update_blog_post', 'update_blog_metadata']) {
    const definition = tool(BLOG_TOOLS, name)
    const properties = definition.inputSchema.properties as Record<string, unknown>
    assert.ok(Object.hasOwn(properties, 'seo_keywords'), `${name} should accept seo_keywords`)
  }
})

test('tenant replace_blog_content requires content_blocks and expected_document_updated_at, with minItems: 1', () => {
  const contentTool = tool(BLOG_TOOLS, 'replace_blog_content')
  const required = contentTool.inputSchema.required as string[]
  assert.ok(required.includes('content_blocks'))
  assert.ok(required.includes('expected_document_updated_at'))
  const properties = contentTool.inputSchema.properties as Record<string, { minItems?: number }>
  assert.equal(properties.content_blocks?.minItems, 1)
})

test('create_platform_blog_post/replace_platform_blog_content descriptions describe content_blocks, not the retired body/components/embed-tag authoring model', () => {
  // Regression: SHARED_TOOL_DESCRIPTION_LINES told the model to send a flat
  // `body` string plus a separate `components[]` array with {{component
  // type="..."}} placeholder tags — an interface that predates content_blocks
  // and no longer exists in either tool's inputSchema. That mismatch is the
  // likely reason ChatGPT sessions kept sending `body`/`components` and
  // getting silently ignored (update) or rejected (create) instead of using
  // content_blocks, as documented in the 2026-07-22 incident.
  for (const name of ['create_platform_blog_post', 'replace_platform_blog_content']) {
    const definition = tool(PLATFORM_MCP_TOOLS, name) as ToolContract & { description: string }
    assert.ok(definition.description.includes('content_blocks'), `${name} description should mention content_blocks`)
    assert.ok(!/\bcomponents\[\]/.test(definition.description), `${name} description should not reference the retired components[] shape`)
    assert.ok(!definition.description.includes('embed tag'), `${name} description should not reference the retired embed-tag mechanism`)
    assert.ok(!definition.description.includes('{{component'), `${name} description should not reference the retired {{component ...}} placeholder syntax`)
  }
})

test('create_platform_doc/update_platform_doc descriptions describe the legacy body/components model, not content_blocks (regression: SHARED_TOOL_DESCRIPTION_LINES leaked blog-only guidance into doc descriptions)', () => {
  // Regression: the doc tools' inputSchema never had content_blocks — they
  // still take body + components[] — but PLATFORM_DOC_TOOL_DESCRIPTION was
  // built from the same SHARED_TOOL_DESCRIPTION_LINES as the blog tools,
  // which told the model content_blocks[] is "the only structured-content
  // authoring shape" and to call get_platform_blog_post for a concurrency
  // token, both wrong for docs.
  for (const name of ['create_platform_doc', 'update_platform_doc']) {
    const definition = tool(PLATFORM_MCP_TOOLS, name) as ToolContract & { description: string }
    assert.ok(!definition.description.includes('content_blocks'), `${name} description should not mention content_blocks`)
    assert.ok(!definition.description.includes('get_platform_blog_post'), `${name} description should not reference get_platform_blog_post`)
    assert.ok(definition.description.includes('body'), `${name} description should describe the body field`)
  }
})

test('the platform blog post projection schema does not require featured_image_asset_id (regression: stale required field never present in properties or emitted by the executor)', () => {
  const getPost = tool(PLATFORM_MCP_TOOLS, 'get_platform_blog_post') as ToolContract & {
    outputSchema: { properties: { post: { required: string[] } } }
  }
  assert.ok(!getPost.outputSchema.properties.post.required.includes('featured_image_asset_id'))
})

test('the platform blog post projection schema declares visibility (regression: update_platform_blog_metadata can write visibility but the canonical read/write response never surfaced it back)', () => {
  const getPost = tool(PLATFORM_MCP_TOOLS, 'get_platform_blog_post') as ToolContract & {
    outputSchema: { properties: { post: { properties: Record<string, unknown>; required: string[] } } }
  }
  assert.ok('visibility' in getPost.outputSchema.properties.post.properties)
  assert.ok(getPost.outputSchema.properties.post.required.includes('visibility'))
})

test('update_platform_blog_metadata parses nullable SEO/media fields with a null-preserving parser, not one that silently converts null to undefined (regression: a request clearing canonical_url with null advanced the concurrency token but never actually cleared the column)', () => {
  const source = readFileSync(new URL('../../server/utils/platform-mcp-executor.ts', import.meta.url), 'utf8')
  const caseStart = source.indexOf("case 'update_platform_blog_metadata':")
  const caseEnd = source.indexOf("case 'replace_platform_blog_content':")
  assert.notEqual(caseStart, -1)
  assert.notEqual(caseEnd, -1)
  const caseBody = source.slice(caseStart, caseEnd)
  for (const field of ['seo_title', 'seo_description', 'seo_keywords', 'canonical_url', 'robots', 'featured_image_asset_id']) {
    assert.match(caseBody, new RegExp(`${field}: optionalNullableString\\(rawArguments, '${field}'\\)`), `${field} should be parsed with optionalNullableString`)
  }
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
