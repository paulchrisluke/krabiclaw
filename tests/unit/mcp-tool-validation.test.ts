import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { validateArguments } from '../../server/utils/mcp-tool-validation.ts'
import { MCP_ERROR } from '../../server/utils/mcp-protocol.ts'
import { getPlatformMcpTool, PLATFORM_INTERNAL_MCP_TOOLS, PLATFORM_MCP_TOOLS, PLATFORM_PUBLIC_MCP_TOOLS } from '../../server/utils/platform-mcp-tools.ts'
import { BLOG_TOOLS } from '../../server/utils/mcp-tools/blog.ts'
import { MEDIA_TOOLS } from '../../server/utils/mcp-tools/media.ts'
import { PRODUCTS_TOOLS } from '../../server/utils/mcp-tools/products.ts'
import { parseMediaPlacementKey } from '../../server/utils/media-placement.ts'

type ToolContract = {
  name: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

function tool(tools: readonly unknown[], name: string): ToolContract {
  const definition = (tools as readonly ToolContract[]).find(candidate => candidate.name === name)
  assert.ok(definition, `missing ${name}`)
  return definition
}

// Asserts both the message content and the MCP error code, so these tests
// keep failing correctly if validateArguments ever stops
// throwing MCP_ERROR.invalidParams specifically (e.g. a refactor that starts
// throwing a generic Error with a similar message would slip past a
// message-only check).
function isInvalidParamsErrorContaining(text: string) {
  return (error: unknown) =>
    error instanceof Error
    && error.message.includes(text)
    && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.invalidParams
}

test('validateArguments rejects the exact 2026-07-22 incident payload against the new metadata tool', () => {
  const metadataTool = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_metadata')
  assert.throws(
    () => validateArguments(metadataTool.inputSchema, {
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

test('validateArguments accepts a valid replace_platform_blog_content call', () => {
  const contentTool = tool(PLATFORM_MCP_TOOLS, 'replace_platform_blog_content')
  assert.doesNotThrow(() => validateArguments(contentTool.inputSchema, {
    post_id: 'post-1',
    expected_document_updated_at: '2026-07-22T00:00:00.000Z',
    content_blocks: [{ type: 'markdown', data: { markdown: 'Hello' } }],
  }))
})

test('validateArguments accepts a metadata-only update_platform_blog_metadata call', () => {
  const metadataTool = tool(PLATFORM_MCP_TOOLS, 'update_platform_blog_metadata')
  assert.doesNotThrow(() => validateArguments(metadataTool.inputSchema, {
    post_id: 'post-1',
    expected_updated_at: '2026-07-22T00:00:00.000Z',
    seo_description: 'Updated description only.',
  }))
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
  assert.equal(Object.hasOwn(properties, 'publish'), false)
  assert.equal(Object.hasOwn(properties, 'scheduled_for'), true)
})

test('platform blog list exposes final publication timing', () => {
  const list = tool(PLATFORM_MCP_TOOLS, 'list_platform_blog_posts')
  const output = list.outputSchema as { properties: { posts: { items: { properties: Record<string, unknown>; required: string[] } } } }
  const summary = output.properties.posts.items
  assert.deepEqual(summary.properties.status, { type: 'string', enum: ['published', 'scheduled'] })
  assert.deepEqual(summary.properties.scheduled_for, { type: ['string', 'null'] })
  assert.ok(summary.required.includes('status'))
  assert.ok(summary.required.includes('scheduled_for'))
})

test('PLATFORM_PUBLIC_MCP_TOOLS and PLATFORM_INTERNAL_MCP_TOOLS are disjoint and together form PLATFORM_MCP_TOOLS', () => {
  const publicNames = new Set(PLATFORM_PUBLIC_MCP_TOOLS.map(t => t.name))
  const internalNames = new Set(PLATFORM_INTERNAL_MCP_TOOLS.map(t => t.name))
  for (const name of internalNames) assert.equal(publicNames.has(name), false, `${name} should not be in both registries`)
  assert.equal(PLATFORM_MCP_TOOLS.length, PLATFORM_PUBLIC_MCP_TOOLS.length + PLATFORM_INTERNAL_MCP_TOOLS.length)
  for (const name of ['get_content_document_outline', 'get_content_block', 'append_content_block', 'replace_content_block', 'delete_content_block', 'render_content_preview']) {
    assert.ok(internalNames.has(name), `${name} should be internal`)
  }
  assert.equal(getPlatformMcpTool('publish_content_revision'), null)
})

test('platform blog lifecycle tools require both exact concurrency tokens', () => {
  assert.equal(getPlatformMcpTool('unpublish_platform_blog_post'), null)
  for (const name of ['publish_platform_blog_post']) {
    const lifecycleTool = tool(PLATFORM_MCP_TOOLS, name)
    assert.deepEqual(lifecycleTool.inputSchema.required, [
      'post_id',
      'expected_updated_at',
      'expected_document_updated_at',
    ])
    assert.doesNotThrow(() => validateArguments(lifecycleTool.inputSchema, {
      post_id: 'post-1',
      expected_updated_at: '2026-07-22T00:00:00.000Z',
      expected_document_updated_at: '2026-07-22T00:00:01.000Z',
    }))
  }
})

test('validateArguments permits unknown keys for schemas without additionalProperties: false', () => {
  assert.doesNotThrow(() => validateArguments(
    { type: 'object', properties: { post_id: { type: 'string' } } },
    { post_id: 'post-1', anything_else: 'passes through unchanged' },
  ))
})

test('validateArguments sorts multiple unknown keys deterministically', () => {
  assert.throws(
    () => validateArguments(
      { type: 'object', additionalProperties: false, properties: { post_id: { type: 'string' } } },
      { post_id: 'post-1', zeta: 1, alpha: 2 },
    ),
    (error: unknown) => error instanceof Error && error.message === 'Unknown arguments: alpha, zeta' && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.invalidParams,
  )
})

test('validateArguments rejects unknown fields in nested Products', () => {
  const batch = tool(PRODUCTS_TOOLS, 'batch_create_products')
  assert.throws(
    () => validateArguments(batch.inputSchema, {
      site_id: 'site-1',
      location_id: 'location-1',
      products: [{ category: 'Mains', name: 'Curry', price_amount: '250', prize_amount: 250 }],
    }),
    isInvalidParamsErrorContaining('products[0].prize_amount'),
  )
})

test('validateArguments enforces recursive array bounds and uniqueness', () => {
  const batch = tool(PRODUCTS_TOOLS, 'batch_create_products')
  const maxProducts = ((batch.inputSchema.properties as Record<string, { maxItems?: number }>).products.maxItems)!
  assert.throws(
    () => validateArguments(batch.inputSchema, { site_id: 'site-1', location_id: 'location-1', products: [] }),
    isInvalidParamsErrorContaining('products must contain at least 1 item'),
  )
  assert.throws(
    () => validateArguments(batch.inputSchema, {
      site_id: 'site-1',
      location_id: 'location-1',
      products: Array.from({ length: maxProducts + 1 }, (_, index) => ({ category: 'Mains', name: `Product ${index}`, price_amount: '1' })),
    }),
    isInvalidParamsErrorContaining(`products must contain at most ${maxProducts} items`),
  )
  assert.doesNotThrow(() => validateArguments(batch.inputSchema, {
    site_id: 'site-1',
    location_id: 'location-1',
    products: Array.from({ length: maxProducts }, (_, index) => ({ category: 'Mains', name: `Product ${index}`, price_amount: '1' })),
  }))

  const nestedArraySchema = {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: { ids: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'string' } } },
        },
      },
    },
  }
  assert.throws(
    () => validateArguments(nestedArraySchema, { groups: [{ ids: [] }] }),
    isInvalidParamsErrorContaining('groups[0].ids must contain at least 1 item'),
  )
  assert.throws(
    () => validateArguments(nestedArraySchema, { groups: [{ ids: ['asset-1', 'asset-2', 'asset-3'] }] }),
    isInvalidParamsErrorContaining('groups[0].ids must contain at most 2 items'),
  )
  assert.throws(
    () => validateArguments(nestedArraySchema, { groups: [{ ids: ['asset-1', 'asset-1'] }] }),
    isInvalidParamsErrorContaining('groups[0].ids must contain unique items'),
  )
})

test('the tenant update_blog_post/create_blog_post schemas are strict (regression: siteTool() defaulted to additionalProperties: true, making tenant validation a no-op)', () => {
  for (const name of ['create_blog_post', 'update_blog_post', 'update_blog_metadata', 'replace_blog_content']) {
    const definition = tool(BLOG_TOOLS, name)
    assert.equal(definition.inputSchema.additionalProperties, false, `${name} should reject unknown top-level arguments`)
  }
})

test('validateArguments rejects the tenant incident shape: update_blog_post called with body instead of content_blocks', () => {
  const updateBlogPost = tool(BLOG_TOOLS, 'update_blog_post')
  assert.throws(
    () => validateArguments(updateBlogPost.inputSchema, {
      site_id: 'site-1',
      post_id: 'post-1',
      expected_document_updated_at: '2026-07-22T00:00:00.000Z',
      body: 'This should never be persisted.',
    }),
    isInvalidParamsErrorContaining('body'),
  )
})

test('validateArguments accepts a valid tenant update_blog_post call', () => {
  const updateBlogPost = tool(BLOG_TOOLS, 'update_blog_post')
  assert.doesNotThrow(() => validateArguments(updateBlogPost.inputSchema, {
    site_id: 'site-1',
    post_id: 'post-1',
    expected_document_updated_at: '2026-07-22T00:00:00.000Z',
    content_blocks: [{ type: 'markdown', data: { markdown: 'Hello' } }],
  }))
})

test('tenant set_media cannot target platform control-plane documents', () => {
  const setMedia = tool(MEDIA_TOOLS, 'set_media')
  const properties = setMedia.inputSchema.properties as {
    placement: { properties: { owner_type: { enum: string[] } } }
  }
  assert.equal(properties.placement.properties.owner_type.enum.includes('platform_doc'), false)
  assert.throws(
    () => parseMediaPlacementKey({ owner_type: 'platform_doc', owner_id: 'doc-1', slot: 'featured' }),
    (error: unknown) => error instanceof Error && error.message.includes('placement.owner_type is invalid'),
  )
})

test('tenant set_media accepts one scalar asset or null and rejects the legacy array input', () => {
  const setMedia = tool(MEDIA_TOOLS, 'set_media')
  const placement = { owner_type: 'post', owner_id: 'post-1', slot: 'cover' }
  assert.doesNotThrow(() => validateArguments(setMedia.inputSchema, { site_id: 'site-1', placement, asset_id: 'asset-1' }))
  assert.doesNotThrow(() => validateArguments(setMedia.inputSchema, { site_id: 'site-1', placement, asset_id: null }))
  assert.throws(
    () => validateArguments(setMedia.inputSchema, { site_id: 'site-1', placement, asset_ids: ['asset-1'] }),
    isInvalidParamsErrorContaining('asset_ids'),
  )
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

test('create_platform_blog_post/replace_platform_blog_content descriptions expose content_blocks authoring', () => {
  for (const name of ['create_platform_blog_post', 'replace_platform_blog_content']) {
    const definition = tool(PLATFORM_MCP_TOOLS, name) as ToolContract & { description: string }
    assert.ok(definition.description.includes('content_blocks'), `${name} description should mention content_blocks`)
    assert.ok(!/\bcomponents\[\]/.test(definition.description), `${name} description should not reference components[]`)
    assert.ok(!definition.description.includes('embed tag'), `${name} description should not reference embed tags`)
    assert.ok(!definition.description.includes('{{component'), `${name} description should not reference {{component ...}} syntax`)
  }
})

test('create_platform_doc/update_platform_doc descriptions expose only content_blocks authoring', () => {
  for (const name of ['create_platform_doc', 'update_platform_doc']) {
    const definition = tool(PLATFORM_MCP_TOOLS, name) as ToolContract & { description: string }
    assert.ok(definition.description.includes('content_blocks'), `${name} description should mention content_blocks`)
    assert.ok(!definition.description.includes('get_platform_blog_post'), `${name} description should not reference get_platform_blog_post`)
    assert.ok(definition.description.includes('there is no body'), `${name} description should reject a body field`)
  }
})

test('the platform blog post projection schema declares visibility', () => {
  const getPost = tool(PLATFORM_MCP_TOOLS, 'get_platform_blog_post') as ToolContract & {
    outputSchema: { properties: { post: { properties: Record<string, unknown>; required: string[] } } }
  }
  assert.ok('visibility' in getPost.outputSchema.properties.post.properties)
  assert.ok(getPost.outputSchema.properties.post.required.includes('visibility'))
})

test('the platform blog post projection exposes non-null document concurrency and scheduling state', () => {
  const getPost = tool(PLATFORM_MCP_TOOLS, 'get_platform_blog_post') as ToolContract & {
    outputSchema: { properties: { post: { properties: Record<string, { type?: unknown }>; required: string[] } } }
  }
  const post = getPost.outputSchema.properties.post
  assert.equal(post.properties.document_updated_at?.type, 'string')
  assert.ok(post.required.includes('document_updated_at'))
  assert.deepEqual(post.properties.scheduled_for?.type, ['string', 'null'])
  assert.ok(post.required.includes('scheduled_for'))
})

test('update_platform_blog_metadata preserves explicit null SEO fields', () => {
  const source = readFileSync(new URL('../../server/utils/platform-mcp-executor.ts', import.meta.url), 'utf8')
  const caseStart = source.indexOf("case 'update_platform_blog_metadata':")
  const caseEnd = source.indexOf("case 'replace_platform_blog_content':")
  assert.notEqual(caseStart, -1)
  assert.notEqual(caseEnd, -1)
  const caseBody = source.slice(caseStart, caseEnd)
  for (const field of ['seo_title', 'seo_description', 'seo_keywords', 'canonical_url', 'robots']) {
    assert.match(caseBody, new RegExp(`${field}: optionalNullableString\\(rawArguments, '${field}'\\)`), `${field} should be parsed with optionalNullableString`)
  }
})

test('validateArguments rejects prototype property names as unknown args, not treats them as allowed', () => {
  // A naive `key in properties` check would incorrectly treat `constructor`/`toString`
  // as allowed (they're inherited from Object.prototype), even though the schema
  // never declared them. Object.keys()-based allow/reject lists must not have that gap.
  assert.throws(
    () => validateArguments(
      { type: 'object', additionalProperties: false, properties: { post_id: { type: 'string' } } },
      { post_id: 'post-1', constructor: 'unexpected' },
    ),
    isInvalidParamsErrorContaining('constructor'),
  )
})

test('validateArguments enforces top-level anyOf mutation requirements', () => {
  const updateMedia = tool(MEDIA_TOOLS, 'update_media_asset')
  assert.throws(
    () => validateArguments(updateMedia.inputSchema, { site_id: 'site-1', asset_id: 'asset-1' }),
    isInvalidParamsErrorContaining('alt_text | category'),
  )
  assert.doesNotThrow(() => validateArguments(updateMedia.inputSchema, {
    site_id: 'site-1',
    asset_id: 'asset-1',
    alt_text: 'Updated description',
  }))
})
