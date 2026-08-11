import assert from 'node:assert/strict'
import test from 'node:test'

import { BLOG_TOOLS } from '../../server/utils/mcp-tools/blog.ts'
import { MCP_PUBLIC_TOOLS } from '../../server/utils/mcp-tools/index.ts'
import { MEDIA_TOOLS } from '../../server/utils/mcp-tools/media.ts'
import { POSTS_TOOLS } from '../../server/utils/mcp-tools/posts.ts'
import { siteIdSchema } from '../../server/utils/mcp-tools/shared.ts'
import { CHOWBOT_TOOLS } from '../../server/utils/chowbot-tools/index.ts'
import { PostValidationError, validatePostInput } from '../../server/utils/post-management.ts'

type ToolContract = {
  name: string
  inputSchema: { required?: readonly string[], properties?: Record<string, unknown>, additionalProperties?: boolean }
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
    assert.equal(post.inputSchema.properties?.image_asset_id, undefined)
    assert.equal(post.inputSchema.properties?.gallery_media, undefined)
  }

  const upload = tool(MEDIA_TOOLS, 'upload_user_media')
  assert.deepEqual(upload.inputSchema.required, ['file'])
  assert.equal(upload.inputSchema.additionalProperties, false)
  assert.equal(upload.inputSchema.properties?.file_id, undefined)
  for (const property of ['asset_id', 'status', 'public_url', 'thumbnail_url']) {
    assert.ok(upload.outputSchema?.properties?.[property], `missing upload output ${property}`)
  }
  for (const property of ['assetId', 'publicUrl', 'thumbnailUrl']) {
    assert.equal(upload.outputSchema?.properties?.[property], undefined, `upload output must not expose ${property}`)
  }

  assert.equal((MEDIA_TOOLS as ToolContract[]).some(candidate => candidate.name === 'open_video_upload'), false)
  assert.equal((MEDIA_TOOLS as ToolContract[]).some(candidate => candidate.name.startsWith('open_') && candidate.name.includes('upload')), false)
  assert.equal((MEDIA_TOOLS as ToolContract[]).some(candidate => candidate.name === 'set_media'), true)
  assert.equal(MCP_PUBLIC_TOOLS.some(candidate => candidate.name === 'upload_user_photo'), false)

  const setMedia = tool(MEDIA_TOOLS, 'set_media')
  assert.deepEqual(setMedia.inputSchema.required, ['target_type', 'asset_ids'])
  assert.equal(setMedia.inputSchema.additionalProperties, false)
  assert.equal(setMedia.inputSchema.properties?.target, undefined)
  assert.ok(setMedia.inputSchema.properties?.target_type)

  assert.match(upload.description, /only upload path/i)
  assert.match(upload.description, /native ChatGPT file argument/i)
  assert.match(upload.description, /never pass a bare file_id/i)
  assert.match(upload.description, /one download attempt/i)
})

test('media placement contract does not reintroduce entity-specific assignment tools', () => {
  const removedToolNames = [
    'set_experience_media',
    'set_experience_image',
    'set_experience_video',
    'reorder_experience_gallery',
    'set_home_hero_image',
    'set_home_hero_video',
    'set_location_hero_image',
    'set_location_hero_video',
    'set_menu_item_media',
    'set_post_image',
    'set_blog_post_image',
    'set_logo',
    'clear_home_hero_image',
    'clear_home_hero_video',
    'clear_location_hero_image',
    'clear_location_hero_video',
  ]
  const mcpNames = new Set(MCP_PUBLIC_TOOLS.map(tool => tool.name))
  const chowbotNames = new Set(CHOWBOT_TOOLS.map(tool => tool.name))
  assert.equal(mcpNames.has('set_media'), true, 'set_media must be exposed by MCP')
  assert.equal(chowbotNames.has('set_media'), true, 'set_media must be exposed by ChowBot')
  for (const name of removedToolNames) {
    assert.equal(mcpNames.has(name), false, `${name} must not be exposed by MCP`)
    assert.equal(chowbotNames.has(name), false, `${name} must not be exposed by ChowBot`)
  }
})

test('MCP site_id schema requires the internal site id, not a public locator', () => {
  const description = siteIdSchema.site_id.description
  assert.match(description, /Internal KrabiClaw site ID/)
  assert.match(description, /site-pottery-house/)
  assert.match(description, /Do not pass a public URL/)
  assert.doesNotMatch(description, /subdomain, or custom domain/)
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
