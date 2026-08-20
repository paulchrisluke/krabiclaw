import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

import { MCP_ERROR } from '../../server/utils/mcp-protocol.ts'

type LifecycleInput = {
  action: 'publish' | 'unpublish'
  expected_updated_at: string
  expected_document_updated_at: string
  scheduled_for?: string | null
}

const database = {} as D1Database
const lifecycleCalls: Array<{
  postId: string
  input: LifecycleInput
  siteId: string | null
}> = []
const readCalls: Array<{ postId: string; siteId: string | null }> = []

function canonicalPost() {
  return {
    id: 'post-1',
    title: 'Canonical platform post',
    slug: 'canonical-platform-post',
    status: 'published',
    visibility: 'public',
    excerpt: null,
    category: 'Marketing',
    nav_section: null,
    nav_title: null,
    nav_order: null,
    nav_section_order: null,
    hide_from_nav: false,
    featured_order: null,
    published_at: '2026-08-13T00:00:03.000Z',
    scheduled_for: null,
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:03.000Z',
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    canonical_url: null,
    robots: 'index,follow',
    featured_image: {
      asset_id: null,
      public_url: null,
      kind: null,
      width: null,
      height: null,
    },
    admin_edit_url: '/admin/blog/post-1',
    public_path: '/blog/marketing/canonical-platform-post',
    public_url: '/blog/marketing/canonical-platform-post',
    preview_url: null,
    content_blocks: [{
      id: 'compatibility-block',
      parent_block_id: null,
      type: 'markdown',
      position: 0,
      level: null,
      updated_at: '2026-08-13T00:00:01.000Z',
      data: { markdown: 'This top-level compatibility shape must not be read.' },
    }],
    content_document: {
      document: { updated_at: '2026-08-13T00:00:04.000Z' },
      blocks: [{
        id: 'canonical-block',
        parent_block_id: null,
        type: 'divider',
        position: 0,
        level: null,
        updated_at: '2026-08-13T00:00:04.000Z',
        data: {},
      }],
    },
  }
}

let post = canonicalPost()

mock.module('../../server/utils/mcp-auth.ts', {
  namedExports: {
    requireMcpUser: async () => ({
      db: database,
      env: {},
      userId: 'platform-admin-1',
      isPlatformAdmin: true,
    }),
  },
})

const unexpected = (name: string) => async () => {
  throw new Error(`${name} should not be called by the platform blog lifecycle test`)
}

mock.module('../../server/utils/platform-content.ts', {
  namedExports: {
    createPlatformBlogPost: unexpected('createPlatformBlogPost'),
    createPlatformDoc: unexpected('createPlatformDoc'),
    deletePlatformBlogPost: unexpected('deletePlatformBlogPost'),
    deletePlatformDoc: unexpected('deletePlatformDoc'),
    getPlatformBlogPost: async (_db: D1Database, postId: string, siteId: string | null) => {
      readCalls.push({ postId, siteId })
      return post
    },
    getPlatformDoc: unexpected('getPlatformDoc'),
    listPlatformBlogPosts: unexpected('listPlatformBlogPosts'),
    listPlatformDocs: unexpected('listPlatformDocs'),
    reorderPlatformBlogPosts: unexpected('reorderPlatformBlogPosts'),
    reorderPlatformDocs: unexpected('reorderPlatformDocs'),
    updatePlatformBlogLifecycle: async (_db: D1Database, postId: string, input: LifecycleInput, siteId: string | null) => {
      lifecycleCalls.push({ postId, input, siteId })
    },
    updatePlatformBlogPost: unexpected('updatePlatformBlogPost'),
    updatePlatformDoc: unexpected('updatePlatformDoc'),
  },
})

const {
  executePlatformMcpToolCall,
  platformBlogLifecycleCall,
  projectPlatformBlogPostForMcp,
} = await import('../../server/utils/platform-mcp-executor.ts?platform-blog-lifecycle-test')

const event = {
  runtime: {
    cloudflare: {
      env: { BETTER_AUTH_URL: 'https://krabiclaw.com' },
    },
  },
} as never

test.beforeEach(() => {
  lifecycleCalls.length = 0
  readCalls.length = 0
  post = canonicalPost()
})

test('platform MCP publish uses the atomic dual-token lifecycle and rereads one canonical post envelope', async () => {
  const result = await executePlatformMcpToolCall(event, 'publish_platform_blog_post', {
    post_id: 'post-1',
    site_id: 'site-1',
    expected_updated_at: '2026-08-13T00:00:02.000Z',
    expected_document_updated_at: '2026-08-13T00:00:01.000Z',
    scheduled_for: null,
  }) as { post: { content_blocks: Array<{ id: string }>; document_updated_at: string } }

  assert.deepEqual(lifecycleCalls, [{
    postId: 'post-1',
    siteId: 'site-1',
    input: {
      action: 'publish',
      expected_updated_at: '2026-08-13T00:00:02.000Z',
      expected_document_updated_at: '2026-08-13T00:00:01.000Z',
      scheduled_for: null,
    },
  }])
  assert.deepEqual(readCalls, [{ postId: 'post-1', siteId: 'site-1' }])
  assert.deepEqual(Object.keys(result), ['post'])
  assert.deepEqual(result.post.content_blocks.map(block => block.id), ['canonical-block'])
  assert.equal(result.post.document_updated_at, '2026-08-13T00:00:04.000Z')
})

test('platform MCP unpublish requires both concurrency tokens before any write or reread', async () => {
  await assert.rejects(
    () => executePlatformMcpToolCall(event, 'unpublish_platform_blog_post', {
      post_id: 'post-1',
      expected_updated_at: '2026-08-13T00:00:02.000Z',
    }),
    (error: unknown) => error instanceof Error
      && error.message.includes('expected_document_updated_at is required')
      && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.invalidParams,
  )
  assert.equal(lifecycleCalls.length, 0)
  assert.equal(readCalls.length, 0)
})

test('platform lifecycle input trims exact tokens and rejects scheduling an unpublish', () => {
  assert.deepEqual(platformBlogLifecycleCall({
    post_id: ' post-1 ',
    expected_updated_at: ' post-token ',
    expected_document_updated_at: ' document-token ',
    scheduled_for: ' 2026-08-20T10:00:00.000Z ',
  }, 'publish'), {
    postId: 'post-1',
    siteId: null,
    input: {
      action: 'publish',
      expected_updated_at: 'post-token',
      expected_document_updated_at: 'document-token',
      scheduled_for: '2026-08-20T10:00:00.000Z',
    },
  })
  assert.throws(
    () => platformBlogLifecycleCall({
      post_id: 'post-1',
      expected_updated_at: 'post-token',
      expected_document_updated_at: 'document-token',
      scheduled_for: null,
    }, 'unpublish'),
    /scheduled_for is only valid when publishing/,
  )
})

test('platform blog projection rejects a missing canonical document instead of fabricating empty content', () => {
  assert.throws(
    () => projectPlatformBlogPostForMcp({ ...canonicalPost(), content_document: undefined }),
    (error: unknown) => error instanceof Error
      && error.message.includes('invalid post.content_document')
      && (error as Error & { mcp?: { code?: number } }).mcp?.code === MCP_ERROR.internal,
  )
})
