import assert from 'node:assert/strict'
import test from 'node:test'

import { renderPlatformMcpPrompt } from '../../server/utils/platform-mcp-prompts.ts'
import { getPlatformMcpTool } from '../../server/utils/platform-mcp-tools.ts'

test('update_and_publish_post prompt does not reference the retired update_platform_blog_post tool (regression: the prompt kept instructing the model to call a tool removed from both discovery and dispatch, guaranteeing methodNotFound)', () => {
  const { text } = renderPlatformMcpPrompt('update_and_publish_post', {
    identifier: 'post-1',
    body: 'Approved final content.',
  })
  assert.ok(!text.includes('update_platform_blog_post'), 'prompt must not reference the retired update_platform_blog_post tool')
  assert.ok(getPlatformMcpTool('update_platform_blog_post') === null, 'sanity check: update_platform_blog_post really is gone')
})

test('update_and_publish_post prompt only references tool names that resolve through getPlatformMcpTool', () => {
  const { text } = renderPlatformMcpPrompt('update_and_publish_post', {
    identifier: 'post-1',
    body: 'Approved final content.',
  })
  for (const name of ['get_platform_blog_post', 'replace_platform_blog_content', 'update_platform_blog_metadata', 'publish_platform_blog_post']) {
    assert.ok(text.includes(name), `prompt should reference ${name}`)
    assert.ok(getPlatformMcpTool(name) !== null, `${name} should resolve through getPlatformMcpTool`)
  }
})

test('draft_blog_post prompt only references tool names that resolve through getPlatformMcpTool', () => {
  const { text } = renderPlatformMcpPrompt('draft_blog_post', { topic: 'Growing tomatoes' })
  for (const name of ['list_platform_blog_posts', 'get_platform_blog_post', 'list_platform_media_assets', 'upload_platform_image', 'create_platform_blog_post', 'publish_platform_blog_post']) {
    if (text.includes(name)) {
      assert.ok(getPlatformMcpTool(name) !== null, `${name} should resolve through getPlatformMcpTool`)
    }
  }
})
