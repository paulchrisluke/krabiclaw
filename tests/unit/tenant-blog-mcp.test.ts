import assert from 'node:assert/strict'
import test from 'node:test'

import { MCP_PROMPTS } from '../../server/utils/mcp-prompts.ts'
import { BLOG_TOOLS } from '../../server/utils/mcp-tools/blog.ts'
import { blogPostMutationResultObject, blogPostObject, blogPostSummaryObject, locationMutationSummaryObject } from '../../server/utils/mcp-tools/shared.ts'

function blogTool(name: string) {
  const definition = BLOG_TOOLS.find(tool => tool.name === name)
  assert.ok(definition, `missing ${name}`)
  return definition
}

test('tenant MCP has no persisted-draft or unpublish blog workflow', () => {
  const toolNames = BLOG_TOOLS.map(tool => tool.name)
  const promptNames = MCP_PROMPTS.map(prompt => prompt.name)
  assert.equal(toolNames.includes('unpublish_blog_post'), false)
  assert.equal(promptNames.some(name => /draft|unpublish/.test(name)), false)
})

test('create_blog_post publishes immediately or schedules a future article', () => {
  const tool = blogTool('create_blog_post')
  const properties = tool.inputSchema.properties as Record<string, unknown>
  assert.equal(tool.confirmRequired, true)
  assert.equal(Object.hasOwn(properties, 'scheduled_for'), true)
  assert.equal(Object.hasOwn(properties, 'status'), false)
  assert.equal(Object.hasOwn(properties, 'publish'), false)
  assert.equal(Object.hasOwn(properties, 'unpublish'), false)
  assert.deepEqual(tool.inputSchema.required, ['title', 'content_blocks'])
})

test('publish_blog_post only publishes or reschedules an already-scheduled article', () => {
  const tool = blogTool('publish_blog_post')
  const properties = tool.inputSchema.properties as Record<string, unknown>
  assert.equal(tool.confirmRequired, true)
  assert.equal(Object.hasOwn(properties, 'scheduled_for'), true)
  assert.deepEqual(tool.inputSchema.required, ['post_id', 'expected_updated_at', 'expected_document_updated_at'])
  assert.match(tool.description, /scheduled tenant blog article/i)
})

test('live blog edits expose canonical blocks and concurrency without lifecycle inputs', () => {
  for (const name of ['update_blog_post', 'update_blog_metadata', 'replace_blog_content']) {
    const properties = blogTool(name).inputSchema.properties as Record<string, unknown>
    for (const field of ['status', 'publish', 'unpublish', 'scheduled_for']) {
      assert.equal(Object.hasOwn(properties, field), false, `${name} must not accept ${field}`)
    }
  }
  const update = blogTool('update_blog_post')
  const updateProperties = update.inputSchema.properties as Record<string, unknown>
  assert.equal(Object.hasOwn(updateProperties, 'content_blocks'), true)
  assert.equal(Object.hasOwn(updateProperties, 'expected_document_updated_at'), true)
})

test('blog mutation schema owns the document token without leaking it into location mutations', () => {
  const postSchema = blogPostMutationResultObject.properties.post as typeof blogPostObject
  assert.equal(Object.hasOwn(postSchema.properties, 'document_updated_at'), true)
  assert.equal(Object.hasOwn(locationMutationSummaryObject.properties, 'expected_document_updated_at'), false)
})

test('tenant blog outputs use one canonical structured envelope', () => {
  for (const schema of [blogPostObject, blogPostMutationResultObject.properties.post as typeof blogPostObject]) {
    assert.equal(Object.hasOwn(schema.properties, 'content_blocks'), true)
    assert.equal(Object.hasOwn(schema.properties, 'document_updated_at'), true)
    assert.equal(Object.hasOwn(schema.properties, 'body'), false)
    assert.equal(Object.hasOwn(schema.properties, 'content_document'), false)
    assert.equal(schema.additionalProperties, false)
  }
  assert.equal(Object.hasOwn(blogPostSummaryObject.properties, 'body'), false)
  for (const name of ['get_blog_post', 'create_blog_post', 'update_blog_post', 'update_blog_metadata', 'replace_blog_content', 'publish_blog_post']) {
    const outputSchema = blogTool(name).outputSchema as typeof blogPostMutationResultObject
    assert.deepEqual(Object.keys(outputSchema.properties), ['post'])
    assert.deepEqual(outputSchema.required, ['post'])
  }
})
