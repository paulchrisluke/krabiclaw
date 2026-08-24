import assert from 'node:assert/strict'
import test from 'node:test'

import { handleBlogTools, projectBlogPostForMcp } from '../../server/utils/mcp-executor/blog.ts'
import { MCP_ERROR } from '../../server/utils/mcp-protocol.ts'

function invalidParamsContaining(text: string) {
  return (error: unknown) =>
    error instanceof Error
    && error.message.includes(text)
    && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.invalidParams
}

function ctx(toolName: string, args: Record<string, unknown>) {
  return {
    toolName,
    args,
    site: {
      db: {},
      siteId: 'site-1',
      organizationId: 'org-1',
      userId: 'user-1',
      env: {},
    },
  } as Parameters<typeof handleBlogTools>[0]
}

function canonicalPost() {
  return {
    id: 'post-1',
    title: 'Canonical post',
    slug: 'canonical-post',
    excerpt: null,
    category: 'Guides',
    tags: ['canonical'],
    nav_section: null,
    nav_title: null,
    nav_order: null,
    nav_section_order: null,
    hide_from_nav: false,
    featured_order: null,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    canonical_url: null,
    robots: null,
    author_name: null,
    site_author_id: null,
    published: true,
    published_at: null,
    status: 'published',
    visibility: 'public',
    scheduled_for: null,
    created_at: '2026-07-23T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:01.000Z',
    featured_image: {
      asset_id: null,
      public_url: null,
      kind: null,
      width: null,
      height: null,
    },
    admin_edit_url: '/dashboard/org/sites/site/blog/post-1',
    edit_url: '/dashboard/org/sites/site/blog/post-1',
    public_path: '/blog/canonical-post',
    public_url: null,
    preview_url: null,
    view_url: 'https://example.com/blog/canonical-post',
    content_blocks: [{
      id: 'noncanonical-block',
      parent_block_id: null,
      type: 'markdown',
      position: 0,
      level: null,
      data: { markdown: 'Top-level compatibility data must not be read.' },
    }],
    content_document: {
      document: { updated_at: '2026-07-23T00:00:02.000Z' },
      blocks: [{
        id: 'canonical-block',
        parent_block_id: null,
        type: 'heading',
        position: 0,
        level: 2,
        data: { text: 'Canonical document data' },
      }],
    },
  }
}

test('tenant update_blog_post rejects a no-op before touching the backend', async () => {
  await assert.rejects(
    () => handleBlogTools(ctx('update_blog_post', { site_id: 'site-1', post_id: 'post-1' })),
    invalidParamsContaining('At least one blog mutation field is required.'),
  )
})

test('tenant update_blog_metadata rejects a no-op before touching the backend', async () => {
  await assert.rejects(
    () => handleBlogTools(ctx('update_blog_metadata', { site_id: 'site-1', post_id: 'post-1', expected_updated_at: '2026-07-23T00:00:00.000Z' })),
    invalidParamsContaining('At least one blog metadata field is required.'),
  )
})

test('tenant replace_blog_content rejects a missing document concurrency token before touching the backend', async () => {
  await assert.rejects(
    () => handleBlogTools(ctx('replace_blog_content', {
      site_id: 'site-1',
      post_id: 'post-1',
      content_blocks: [{ type: 'markdown', data: { markdown: 'Updated.' } }],
    })),
    invalidParamsContaining('Invalid expected_document_updated_at'),
  )
})

test('tenant blog projection reads only the canonical content document', () => {
  const projected = projectBlogPostForMcp(canonicalPost())
  assert.equal(projected.document_updated_at, '2026-07-23T00:00:02.000Z')
  assert.deepEqual(projected.content_blocks.map(block => block.id), ['canonical-block'])
})

test('tenant blog projection rejects missing documents and malformed blocks instead of fabricating content', () => {
  assert.throws(
    () => projectBlogPostForMcp({ ...canonicalPost(), content_document: undefined }),
    /invalid post\.content_document/,
  )
  const post = canonicalPost()
  post.content_document.blocks = [{
    id: 'broken-block',
    parent_block_id: null,
    type: undefined as never,
    position: 0,
    level: null,
    data: {},
  }]
  assert.throws(
    () => projectBlogPostForMcp(post),
    /invalid post\.content_document\.blocks\[0\]\.type/,
  )
})

test('tenant blog lifecycle tools require both concurrency tokens before touching the backend', async () => {
  for (const toolName of ['publish_blog_post']) {
    await assert.rejects(
      () => handleBlogTools(ctx(toolName, { site_id: 'site-1', post_id: 'post-1' })),
      invalidParamsContaining('Invalid expected_updated_at'),
    )
    await assert.rejects(
      () => handleBlogTools(ctx(toolName, {
        site_id: 'site-1',
        post_id: 'post-1',
        expected_updated_at: '2026-07-23T00:00:01.000Z',
      })),
      invalidParamsContaining('Invalid expected_document_updated_at'),
    )
  }
})
