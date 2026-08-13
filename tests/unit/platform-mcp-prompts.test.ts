import assert from 'node:assert/strict'
import test from 'node:test'

import { renderPlatformMcpPrompt } from '../../server/utils/platform-mcp-prompts.ts'
import { getPlatformMcpTool } from '../../server/utils/platform-mcp-tools.ts'

test('update_and_publish_post prompt only references tool names that resolve through getPlatformMcpTool', () => {
  const { text } = renderPlatformMcpPrompt('update_and_publish_post', {
    identifier: 'post-1',
    body: 'Approved final content.',
  })
  for (const name of ['get_platform_blog_post', 'replace_platform_blog_content', 'update_platform_blog_metadata', 'publish_platform_blog_post']) {
    assert.ok(text.includes(name), `prompt should reference ${name}`)
    assert.ok(getPlatformMcpTool(name) !== null, `${name} should resolve through getPlatformMcpTool`)
  }
  assert.match(text, /expected_updated_at from the final returned post\.updated_at/)
  assert.match(text, /expected_document_updated_at from the final returned post\.document_updated_at/)
  assert.match(text, /Do not reuse tokens from an earlier read or mutation/)
})

test('draft_blog_post prompt only references tool names that resolve through getPlatformMcpTool', () => {
  const { text } = renderPlatformMcpPrompt('draft_blog_post', { topic: 'Growing tomatoes' })
  for (const name of ['list_platform_blog_posts', 'get_platform_blog_post', 'list_platform_media_assets', 'upload_platform_image', 'create_platform_blog_post', 'publish_platform_blog_post']) {
    if (text.includes(name)) {
      assert.ok(getPlatformMcpTool(name) !== null, `${name} should resolve through getPlatformMcpTool`)
    }
  }
})
