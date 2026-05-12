// GET /api/admin/blog/posts/[postId] - Fetch single platform blog post (including draft)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) return jsonResponse({ error: 'Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  const post = await db.prepare(
    `SELECT id, title, slug, body, excerpt, category, published_at, created_at, updated_at FROM platform_blog_posts WHERE id = ?`
  ).bind(postId).first()

  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ post })
})
