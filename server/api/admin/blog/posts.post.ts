// POST /api/admin/blog/posts - Create platform blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

const TITLE_MAX = 200
const BODY_MAX = 100000
const EXCERPT_MAX = 500
const CATEGORY_MAX = 100
const MAX_SLUG_ATTEMPTS = 8

function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

function isSlugUniqueConstraintError(err: ApiValue): boolean {
  const message = String((err as ApiValue)?.message || err || '')
  return message.includes('platform_blog_posts.slug') || message.includes('UNIQUE constraint failed')
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  let body: { title?: string; body?: string; excerpt?: string; category?: string; publish?: boolean }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.title || !body.body) {
    return jsonResponse({ error: 'title and body are required' }, { status: 400 })
  }

  if (body.title.length > TITLE_MAX) {
    return jsonResponse({ error: `title exceeds maximum length (${TITLE_MAX})` }, { status: 400 })
  }
  if (body.body.length > BODY_MAX) {
    return jsonResponse({ error: `body exceeds maximum length (${BODY_MAX})` }, { status: 400 })
  }
  if (body.excerpt && body.excerpt.length > EXCERPT_MAX) {
    return jsonResponse({ error: `excerpt exceeds maximum length (${EXCERPT_MAX})` }, { status: 400 })
  }
  if (body.category && body.category.length > CATEGORY_MAX) {
    return jsonResponse({ error: `category exceeds maximum length (${CATEGORY_MAX})` }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const baseSlug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  
  // Handle empty slug
  let slug = baseSlug
  if (!slug) {
    slug = `post-${Date.now()}`
  }

  const now = new Date().toISOString()
  const userId = session.user.id

  const publishedAt = body.publish ? now : null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidateSlug = attempt === 0 ? slug : `${slug}-${randomSlugSuffix()}`

    try {
      await db.prepare(
        `INSERT INTO platform_blog_posts (id, title, slug, body, excerpt, category, author_id, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, body.title, candidateSlug, body.body, body.excerpt ?? null, body.category ?? null, userId, publishedAt, now, now).run()

      return jsonResponse({ success: true, id, slug: candidateSlug, published_at: publishedAt })
    } catch (err) {
      if (isSlugUniqueConstraintError(err) && attempt < MAX_SLUG_ATTEMPTS - 1) {
        continue
      }

      console.error('Failed to create blog post:', err)
      return jsonResponse({ error: 'Failed to create post' }, { status: 500 })
    }
  }

  return jsonResponse({ error: 'Failed to create post' }, { status: 500 })
})
