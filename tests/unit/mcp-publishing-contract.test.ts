import assert from 'node:assert/strict'
import test from 'node:test'

import { BLOG_TOOLS } from '../../server/utils/mcp-tools/blog.ts'
import { MEDIA_TOOLS } from '../../server/utils/mcp-tools/media.ts'
import { POSTS_TOOLS } from '../../server/utils/mcp-tools/posts.ts'
import { PostValidationError, validatePostInput } from '../../server/utils/post-management.ts'

type ToolContract = {
  name: string
  inputSchema: { required?: readonly string[], properties?: Record<string, unknown> }
  outputSchema?: { properties?: Record<string, unknown> }
}

function tool(tools: readonly unknown[], name: string): ToolContract {
  const definition = (tools as readonly ToolContract[]).find(candidate => candidate.name === name)
  assert.ok(definition, `missing ${name}`)
  return definition
}

test('blog, post, and media MCP schemas expose the canonical writable contract', () => {
  const blog = tool(BLOG_TOOLS, 'create_blog_post')
  assert.deepEqual(blog.inputSchema.required, ['title', 'content_blocks'])
  assert.equal(blog.inputSchema.properties?.body, undefined)

  for (const name of ['create_post', 'update_post']) {
    const post = tool(POSTS_TOOLS, name)
    assert.ok(post.inputSchema.properties?.image_asset_id)
  }

  const upload = tool(MEDIA_TOOLS, 'upload_user_media')
  for (const property of ['asset_id', 'assetId', 'status', 'public_url', 'publicUrl']) {
    assert.ok(upload.outputSchema?.properties?.[property], `missing upload output ${property}`)
  }

  const openVideo = tool(MEDIA_TOOLS, 'open_video_upload')
  assert.deepEqual(Object.keys(openVideo.outputSchema?.properties ?? {}), ['launched'])
  assert.deepEqual(openVideo.outputSchema?.required, ['launched'])
})

test('post validation rejects invalid event and offer states with field-specific errors', () => {
  assert.throws(
    () => validatePostInput({ body: 'Match tonight', post_type: 'event' }),
    (error: unknown) => error instanceof PostValidationError && error.message.includes('event_start'),
  )
  assert.throws(
    () => validatePostInput({ body: 'Match tonight', post_type: 'event', event_start: 'bad' }),
    (error: unknown) => error instanceof PostValidationError && error.message.includes('event_start'),
  )
  assert.throws(
    () => validatePostInput({ body: 'Match tonight', post_type: 'event', event_start: '2026-07-20T20:00:00+07:00', event_end: '2026-07-20T19:00:00+07:00' }),
    (error: unknown) => error instanceof PostValidationError && error.message.includes('event_end'),
  )
  assert.throws(
    () => validatePostInput({ body: 'Discount', post_type: 'offer' }),
    (error: unknown) => error instanceof PostValidationError && error.message.includes('offer_terms'),
  )

  assert.doesNotThrow(() => validatePostInput({ body: 'News', post_type: 'standard' }))
  assert.doesNotThrow(() => validatePostInput({ body: 'Match', post_type: 'event', event_start: '2026-07-20T20:00:00+07:00' }))
  assert.doesNotThrow(() => validatePostInput({ body: 'Discount', post_type: 'offer', offer_terms: 'Until midnight' }))
})
