// PATCH /api/admin/blog/posts/[postId] - Update platform blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import slugify from 'slugify'

function isSlugUniqueConstraintError(err: ApiValue): boolean {
  const message = String((err as ApiValue)?.message || err || '')
  return message.includes('platform_blog_posts.slug') || message.includes('UNIQUE constraint failed')
}

export default defineEventHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) return jsonResponse({ error: 'Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  let body: { title?: string; body?: string; excerpt?: string; category?: string; publish?: boolean; unpublish?: boolean }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiRecord[] = [now]

  if (body.title !== undefined) {
    const slug = slugify(body.title, { lower: true, strict: true, trim: true })
    if (!slug) {
      return jsonResponse({ error: 'Title must contain alphanumeric characters to generate a valid slug' }, { status: 400 })
    }

    const existingSlug = await db.prepare(
      `SELECT id FROM platform_blog_posts WHERE slug = ? AND id != ? LIMIT 1`
    ).bind(slug, postId).first()

    if (existingSlug) {
      return jsonResponse({ error: 'Slug already in use' }, { status: 400 })
    }

    updates.push('title = ?', 'slug = ?')
    params.push(body.title, slug)
  }
  
  const fields: Array<'body' | 'excerpt' | 'category'> = ['body', 'excerpt', 'category']
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`)
      params.push(body[field])
    }
  }
  
  if (body.publish && body.unpublish) {
    return jsonResponse({ error: 'Cannot publish and unpublish simultaneously' }, { status: 400 })
  }
  if (body.publish) {
    updates.push('published_at = ?')
    params.push(now)
  }
  if (body.unpublish) {
    updates.push('published_at = NULL')
  }

  params.push(postId)
  
  try {
    const result = await db.prepare(`UPDATE platform_blog_posts SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  if (!result.meta.changes || result.meta.changes === 0) {
      return jsonResponse({ error: 'Post not found' }, { status: 404 })
    }
  } catch (err) {
    if (isSlugUniqueConstraintError(err)) {
      return jsonResponse({ error: 'Slug already in use' }, { status: 400 })
    }
    console.error('Failed to update blog post:', err)
    return jsonResponse({ error: 'Failed to update post' }, { status: 500 })
  }

  return jsonResponse({ success: true, updated_at: now })
})
