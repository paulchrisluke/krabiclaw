// GET /api/admin/blog/posts - List platform blog posts
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  const query = getQuery(event)
  const status = query.status as string | undefined

  let sql = `SELECT id, title, slug, excerpt, category, author_id, published_at, created_at, updated_at FROM platform_blog_posts`
  const params: ApiRecord[] = []

  if (status === 'published') {
    sql += ` WHERE published_at IS NOT NULL`
  } else if (status === 'draft') {
    sql += ` WHERE published_at IS NULL`
  }

  sql += ` ORDER BY created_at DESC`

  const { results } = await db.prepare(sql).bind(...params).all()
  return jsonResponse({ posts: results ?? [] })
})
