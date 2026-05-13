// GET /api/admin/blog/posts/[postId] - Fetch single platform blog post (including draft)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function auditLog(action: string, payload: Record<string, unknown>) {
  console.info('[audit]', { action, timestamp: new Date().toISOString(), ...payload })
}

export default defineEventHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) return jsonResponse({ error: 'Post ID required' }, { status: 400 })
  if (!UUID_V4_PATTERN.test(postId)) {
    return jsonResponse({ error: 'Invalid postId format' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    auditLog('admin_read_denied', {
      email: session.user.email,
      postId
    })
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  let post: Record<string, unknown> | null = null
  try {
    post = await db.prepare(
      `SELECT id, title, slug, body, excerpt, category, published_at, created_at, updated_at FROM platform_blog_posts WHERE id = ?`
    ).bind(postId).first() as Record<string, unknown> | null
  } catch (err) {
    console.error('Failed to fetch admin blog post', { postId, error: err })
    return jsonResponse({ error: 'Failed to load post' }, { status: 500 })
  }

  if (!post) {
    auditLog('admin_read_not_found', {
      email: session.user.email,
      postId
    })
    return jsonResponse({ error: 'Post not found' }, { status: 404 })
  }

  auditLog('admin_read_post', {
    email: session.user.email,
    postId,
    postSlug: post.slug
  })

  return jsonResponse({ post })
})
