import assert from 'node:assert/strict'
import test from 'node:test'

import { BLOG_TOOLS } from '../../server/utils/mcp-tools/blog.ts'
import { MCP_PUBLIC_TOOLS } from '../../server/utils/mcp-tools/index.ts'
import { EDITABLE_MEDIA_PLACEMENT_OWNERS } from '../../shared/media-placement-contract.ts'
import { renderMcpPrompt } from '../../server/utils/mcp-prompts.ts'
import { MEDIA_TOOLS } from '../../server/utils/mcp-tools/media.ts'
import { MENUS_TOOLS } from '../../server/utils/mcp-tools/menus.ts'
import { POSTS_TOOLS } from '../../server/utils/mcp-tools/posts.ts'
import { ONBOARDING_TOOLS } from '../../server/utils/mcp-tools/onboarding.ts'
import { SITES_TOOLS } from '../../server/utils/mcp-tools/sites.ts'
import { siteIdSchema } from '../../server/utils/mcp-tools/shared.ts'
import { CHOWBOT_TOOLS } from '../../server/utils/chowbot-tools/index.ts'
import { MEDIA_CHOWBOT_TOOLS } from '../../server/utils/chowbot-tools/media.ts'
import { PostValidationError, validatePostInput } from '../../server/utils/post-management.ts'
import { normalizeMenuItemArgs } from '../../server/utils/mcp-executor/shared.ts'
import { INTEGRATIONS_TOOLS } from '../../server/utils/mcp-tools/integrations.ts'
import { publishToPage } from '../../server/utils/facebook-pages.ts'
import { handleMediaTools } from '../../server/utils/mcp-executor/media.ts'

type ToolContract = {
  name: string
  confirmRequired?: boolean
  inputSchema: { required?: readonly string[], properties?: Record<string, unknown>, additionalProperties?: boolean, oneOf?: unknown[] }
  outputSchema?: { properties?: Record<string, unknown>, required?: readonly string[] }
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
    assert.equal(post.inputSchema.additionalProperties, false)
  }

  const publishPost = tool(POSTS_TOOLS, 'publish_post')
  assert.ok(publishPost.inputSchema.properties?.channels)
  assert.equal(publishPost.inputSchema.properties?.targets, undefined)
  assert.equal(publishPost.inputSchema.additionalProperties, false)

  for (const name of ['create_menu_item', 'update_menu_item']) {
    const menuItem = tool(MENUS_TOOLS, name)
    assert.ok(menuItem.inputSchema.properties?.price_amount)
    assert.equal(menuItem.inputSchema.properties?.price, undefined)
  }
  for (const name of ['add_menu_items_batch', 'sync_menu_items']) {
    const menuItems = tool(MENUS_TOOLS, name)
    const items = menuItems.inputSchema.properties?.items as {
      items?: { properties?: Record<string, unknown>, additionalProperties?: boolean }
    }
    assert.ok(items.items?.properties?.price_amount)
    assert.equal(items.items?.properties?.price, undefined)
    assert.equal(items.items?.additionalProperties, false)
  }
  assert.throws(
    () => normalizeMenuItemArgs({ section: 'Mains', name: 'Curry', price: '12' }, { requireSection: true }),
    /Unknown argument: price/,
  )

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
  for (const name of ['save_generated_image', 'save_generated_image_file']) {
    const saveGenerated = tool(ONBOARDING_TOOLS, name)
    for (const property of ['asset_id', 'public_url', 'thumbnail_url']) {
      assert.ok(saveGenerated.outputSchema?.properties?.[property], `missing ${name} output ${property}`)
    }
    for (const property of ['assetId', 'publicUrl', 'thumbnailUrl']) {
      assert.equal(saveGenerated.outputSchema?.properties?.[property], undefined, `${name} must not expose ${property}`)
    }
  }

  const listMedia = tool(MEDIA_TOOLS, 'get_site_media_assets')
  assert.deepEqual(
    (listMedia.inputSchema.properties?.kind as { enum?: string[] }).enum,
    ['image', 'video', 'file'],
  )
  const listMediaAssets = listMedia.outputSchema?.properties?.assets as {
    items?: { properties?: Record<string, unknown> }
  }
  assert.deepEqual(
    (listMediaAssets.items?.properties?.kind as { enum?: string[] }).enum,
    ['image', 'video', 'file'],
  )

  const updateMedia = tool(MEDIA_TOOLS, 'update_media_asset')
  assert.deepEqual(updateMedia.outputSchema?.properties?.updated, { type: 'boolean' })
  assert.deepEqual((updateMedia.inputSchema as { anyOf?: unknown[] }).anyOf, [
    { required: ['alt_text'] },
    { required: ['category'] },
  ])
  const chowbotUpdateMedia = MEDIA_CHOWBOT_TOOLS.find(candidate => candidate.name === 'update_media_asset')
  assert.ok(chowbotUpdateMedia)
  assert.deepEqual((chowbotUpdateMedia.input_schema as { anyOf?: unknown[] }).anyOf, [
    { required: ['alt_text'] },
    { required: ['category'] },
  ])
  assert.deepEqual(
    (updateMedia.inputSchema.properties?.category as { enum?: string[] }).enum,
    ['exterior', 'interior', 'food', 'menu', 'team', 'other'],
  )

  const importMenu = tool(MEDIA_TOOLS, 'import_menu_from_media')
  assert.equal(importMenu.confirmRequired, true)
  assert.deepEqual(importMenu.inputSchema.required, ['asset_id', 'menu_name'])
  assert.deepEqual(Object.keys(importMenu.outputSchema?.properties ?? {}), [
    'menuId',
    'count',
    'warning',
    'creditsRemaining',
  ])
  assert.deepEqual(importMenu.outputSchema?.required, [
    'menuId',
    'count',
    'warning',
    'creditsRemaining',
  ])

  assert.equal(tool(SITES_TOOLS, 'create_site').confirmRequired, true)

  assert.equal((MEDIA_TOOLS as ToolContract[]).some(candidate => candidate.name === 'open_video_upload'), false)
  assert.equal((MEDIA_TOOLS as ToolContract[]).some(candidate => candidate.name.startsWith('open_') && candidate.name.includes('upload')), false)
  assert.equal((MEDIA_TOOLS as ToolContract[]).some(candidate => candidate.name === 'set_media'), true)
  assert.equal(MCP_PUBLIC_TOOLS.some(candidate => candidate.name === 'upload_user_photo'), false)

  const setMedia = tool(MEDIA_TOOLS, 'set_media')
  assert.deepEqual(setMedia.inputSchema.required, ['placement', 'asset_id'])
  assert.equal(setMedia.inputSchema.additionalProperties, false)
  assert.deepEqual(setMedia.inputSchema.properties?.placement, {
    type: 'object',
    additionalProperties: false,
    properties: {
      owner_type: {
        type: 'string',
        enum: [...EDITABLE_MEDIA_PLACEMENT_OWNERS],
      },
      owner_id: { type: 'string' },
      slot: { type: 'string' },
    },
    required: ['owner_type', 'owner_id', 'slot'],
  })
  assert.deepEqual(setMedia.outputSchema?.properties?.placement, setMedia.inputSchema.properties?.placement)

  assert.match(upload.description, /only upload path/i)
  assert.match(upload.description, /native ChatGPT file argument/i)
  assert.match(upload.description, /never pass a bare file_id/i)
  assert.match(upload.description, /one download attempt/i)
})

test('menu import rejects a missing menu name before any external work', async (t) => {
  let fetchCalls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    fetchCalls += 1
    throw new Error('fetch must not run')
  })
  const db = new Proxy({}, {
    get() {
      throw new Error('database must not be touched')
    },
  })

  await assert.rejects(
    () => handleMediaTools({
      toolName: 'import_menu_from_media',
      args: { asset_id: 'asset-1' },
      site: {
        db,
        env: {},
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
      },
    } as Parameters<typeof handleMediaTools>[0]),
    /Invalid menu_name/,
  )
  assert.equal(fetchCalls, 0)
})

test('Facebook publication is immediate and has no persisted-draft argument', async (t) => {
  const publish = tool(INTEGRATIONS_TOOLS, 'publish_to_facebook')
  assert.equal(publish.inputSchema.properties?.published, undefined)

  let requestBody: Record<string, unknown> | null = null
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ id: 'facebook-post-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })

  const result = await publishToPage('page-token', 'page-id', {
    message: 'Open this weekend',
    link: 'https://example.com/weekend',
  })

  assert.deepEqual(result, { id: 'facebook-post-1' })
  assert.deepEqual(requestBody, {
    message: 'Open this weekend',
    link: 'https://example.com/weekend',
    published: true,
  })
})

test('media assignment has one canonical entrypoint on both agent surfaces', () => {
  assert.deepEqual(MCP_PUBLIC_TOOLS.filter(candidate => candidate.name === 'set_media').map(candidate => candidate.name), ['set_media'])
  assert.deepEqual(CHOWBOT_TOOLS.filter(candidate => candidate.name === 'set_media').map(candidate => candidate.name), ['set_media'])
  assert.deepEqual(MEDIA_TOOLS.filter(candidate => candidate.name.startsWith('set_')).map(candidate => candidate.name), ['set_media'])
})

test('generated image picker accepts only canonical assets and an optional placement', () => {
  const picker = tool(ONBOARDING_TOOLS, 'show_generated_images')
  const properties = picker.inputSchema.properties as Record<string, {
    items?: { properties?: Record<string, unknown>, required?: string[], additionalProperties?: boolean }
    properties?: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }>
  assert.deepEqual(properties.images.items?.required, ['asset_id', 'public_url'])
  assert.deepEqual(Object.keys(properties.images.items?.properties ?? {}), ['asset_id', 'public_url'])
  assert.equal(properties.images.items?.additionalProperties, false)
  assert.deepEqual(properties.placement.required, ['owner_type', 'owner_id', 'slot'])
  assert.equal(properties.placement.additionalProperties, false)
})

test('photo prompt uploads each confirmed attachment once before reporting placement', () => {
  const prompt = renderMcpPrompt('add_photos_to_site', {}).text
  assert.match(prompt, /upload_user_media exactly once for each confirmed attachment/)
  assert.match(prompt, /Upload every confirmed photo before reporting any of them as placed/)
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
