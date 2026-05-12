// PATCH /api/admin/blog/posts/[postId] - Update platform blog post
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

  let body: { title?: string; body?: string; excerpt?: string; category?: string; publish?: boolean; unpublish?: boolean }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: any[] = [now]

  if (body.title !== undefined) {
    updates.push('title = ?', 'slug = ?')
    let slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    if (!slug) {
      return jsonResponse({ error: 'Title must contain alphanumeric characters to generate a valid slug' }, { status: 400 })
    }
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
    if (!result.changes || result.changes === 0) {
      return jsonResponse({ error: 'Post not found' }, { status: 404 })
    }
  } catch (err) {
    console.error('Failed to update blog post:', err)
    return jsonResponse({ error: 'Failed to update post', details: String(err) }, { status: 500 })
  }

  return jsonResponse({ success: true, updated_at: now })
})
