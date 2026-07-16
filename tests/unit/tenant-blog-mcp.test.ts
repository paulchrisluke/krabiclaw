import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { MCP_PROMPTS, renderMcpPrompt } from '../../server/utils/mcp-prompts.ts'

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
  assert.match(publish, /update_blog_post/)
  assert.match(publish, /publish_blog_post/)
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
  assert.doesNotMatch(source, /body: \{ type: 'string', description: 'Use \{\{component/)
  assert.match(source, /review the draft at edit_url/i)
})
