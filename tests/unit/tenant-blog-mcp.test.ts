import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { MCP_PROMPTS, renderMcpPrompt } from '../../server/utils/mcp-prompts.ts'
import { BLOG_TOOLS } from '../../server/utils/mcp-tools/blog.ts'
import { blogPostMutationResultObject, blogPostObject, blogPostSummaryObject, locationMutationSummaryObject } from '../../server/utils/mcp-tools/shared.ts'

function blogTool(name: string) {
  const definition = BLOG_TOOLS.find(tool => tool.name === name)
  assert.ok(definition, `missing ${name}`)
  return definition
}

test('tenant MCP exposes draft and approved publish blog workflows', () => {
  const names = MCP_PROMPTS.map(prompt => prompt.name)
  assert.ok(names.includes('draft_blog_post'))
  assert.ok(names.includes('update_and_publish_blog_post'))

  const draft = renderMcpPrompt('draft_blog_post', { topic: 'Choosing a family lawyer' }).text
  assert.match(draft, /list_blog_posts/)
  assert.match(draft, /get_blog_post/)
  assert.match(draft, /approval/i)
  assert.match(draft, /SEO/i)
  assert.match(draft, /Choosing a family lawyer/)

  const publish = renderMcpPrompt('update_and_publish_blog_post', {
    identifier: 'choosing-a-family-lawyer',
    body: 'Approved body',
  }).text
  assert.match(publish, /replace_blog_content/)
  assert.match(publish, /publish_blog_post/)
  assert.match(publish, /document_updated_at/)
  assert.match(publish, /choosing-a-family-lawyer/)
  assert.match(publish, /Approved body/)
})

test('tenant blog MCP contract exposes explicit publishing, tags, and AI assistance', async () => {
  const source = await readFile(new URL('../../server/utils/mcp-tools/blog.ts', import.meta.url), 'utf8')
  assert.match(source, /name: 'publish_blog_post'/)
  assert.match(source, /name: 'unpublish_blog_post'/)
  assert.match(source, /tags: \{ type: 'array'/)
  assert.match(source, /ai_assistance/)
  assert.match(source, /content_blocks/)
  assert.match(source, /expected_document_updated_at/)
  const shared = await readFile(new URL('../../server/utils/mcp-tools/shared.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(shared, /content_document: \{/)
  assert.doesNotMatch(shared, /draft_revision_id/)
  assert.doesNotMatch(source, /body: \{ type: 'string', description: 'Use \{\{component/)
  assert.match(source, /review the draft at edit_url/i)
})

test('blog mutation schema owns the document token without leaking it into location mutations', () => {
  const postSchema = blogPostMutationResultObject.properties.post as typeof blogPostObject
  assert.equal(Object.hasOwn(postSchema.properties, 'document_updated_at'), true)
  assert.equal(Object.hasOwn(locationMutationSummaryObject.properties, 'expected_document_updated_at'), false)
})

test('tenant blog prompts mention only fields accepted by strict tenant blog schemas', () => {
  const draft = renderMcpPrompt('draft_blog_post', { topic: 'Choosing a family lawyer' }).text
  const createProperties = blogTool('create_blog_post').inputSchema.properties as Record<string, unknown>
  for (const field of ['content_blocks', 'category', 'tags', 'excerpt', 'seo_title', 'seo_description', 'seo_keywords', 'robots']) {
    assert.match(draft, new RegExp(`\\b${field}\\b`), `${field} should be documented in the draft prompt`)
    assert.ok(Object.hasOwn(createProperties, field), `${field} should be accepted by create_blog_post`)
  }

  const publish = renderMcpPrompt('update_and_publish_blog_post', { identifier: 'post-1', body: 'Approved body' }).text
  assert.match(publish, /replace_blog_content/)
  assert.match(publish, /expected_document_updated_at/)
  const replaceProperties = blogTool('replace_blog_content').inputSchema.properties as Record<string, unknown>
  for (const field of ['post_id', 'content_blocks', 'expected_document_updated_at']) {
    assert.ok(Object.hasOwn(replaceProperties, field), `${field} should be accepted by replace_blog_content`)
  }
})

test('tenant blog read and mutation output schemas expose only canonical content blocks and one token', () => {
  for (const schema of [blogPostObject, blogPostMutationResultObject.properties.post as typeof blogPostObject]) {
    assert.equal(Object.hasOwn(schema.properties, 'content_blocks'), true)
    assert.equal(Object.hasOwn(schema.properties, 'document_updated_at'), true)
    const blockItems = schema.properties.content_blocks.items
    assert.equal(Object.hasOwn(blockItems.properties, 'updated_at'), false)
    assert.equal(Object.hasOwn(schema.properties, 'body'), false)
    assert.equal(Object.hasOwn(schema.properties, 'components'), false)
    assert.equal(Object.hasOwn(schema.properties, 'content_document'), false)
    assert.equal(schema.additionalProperties, false)
  }
  for (const schema of [blogPostSummaryObject]) {
    assert.equal(Object.hasOwn(schema.properties, 'body'), false)
    assert.equal(Object.hasOwn(schema.properties, 'components'), false)
    assert.equal(Object.hasOwn(schema.properties, 'content_document'), false)
    assert.equal(schema.additionalProperties, false)
  }
})

test('tenant blog output schemas match one structured envelope for canonical mutations', () => {
  for (const name of ['get_blog_post', 'create_blog_post', 'update_blog_post', 'update_blog_metadata', 'replace_blog_content', 'publish_blog_post', 'unpublish_blog_post', 'set_blog_post_image']) {
    const outputSchema = blogTool(name).outputSchema as typeof blogPostMutationResultObject
    assert.deepEqual(Object.keys(outputSchema.properties), ['post'], `${name} should only return the post envelope`)
    assert.deepEqual(outputSchema.required, ['post'])
    assert.equal(outputSchema.additionalProperties, false)
  }
})
