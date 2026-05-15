// PATCH /api/admin/docs/[docId] - Update platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import slugify from 'slugify'

function isSlugUniqueConstraintError(err: ApiValue): boolean {
  const message = String((err as ApiValue)?.message || err || '')
  return message.includes('platform_docs.slug') || message.includes('UNIQUE constraint failed')
}

const VALID_CATEGORIES = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced']
const VALID_DIFFICULTY = ['Beginner', 'Intermediate', 'Advanced']

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId')
  if (!docId) return jsonResponse({ error: 'Doc ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  let body: {
    title?: string
    body?: string
    excerpt?: string
    category?: string
    seo_description?: string
    seo_keywords?: string
    difficulty_level?: string
    sort_order?: number
    parent_doc_id?: string
    featured_image_asset_id?: string
    publish?: boolean
    unpublish?: boolean
  }
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
      `SELECT id FROM platform_docs WHERE slug = ? AND id != ? LIMIT 1`
    ).bind(slug, docId).first()

    if (existingSlug) {
      return jsonResponse({ error: 'Slug already in use' }, { status: 400 })
    }

    updates.push('title = ?', 'slug = ?')
    params.push(body.title, slug)
  }

  const fields: Array<'body' | 'excerpt' | 'category' | 'seo_description' | 'seo_keywords' | 'difficulty_level' | 'sort_order' | 'parent_doc_id' | 'featured_image_asset_id'> = ['body', 'excerpt', 'category', 'seo_description', 'seo_keywords', 'difficulty_level', 'sort_order', 'parent_doc_id', 'featured_image_asset_id']
  for (const field of fields) {
    if (body[field] !== undefined) {
      if (field === 'category' && body.category && !VALID_CATEGORIES.includes(body.category)) {
        return jsonResponse({ error: `invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
      }
      if (field === 'difficulty_level' && body.difficulty_level && !VALID_DIFFICULTY.includes(body.difficulty_level)) {
        return jsonResponse({ error: `invalid difficulty_level. Must be one of: ${VALID_DIFFICULTY.join(', ')}` }, { status: 400 })
      }
      if (field === 'parent_doc_id' && body.parent_doc_id) {
        if (body.parent_doc_id === docId) {
          return jsonResponse({ error: 'A document cannot be its own parent' }, { status: 400 })
        }
        const parentDoc = await db.prepare('SELECT id FROM platform_docs WHERE id = ? LIMIT 1').bind(body.parent_doc_id).first()
        if (!parentDoc) {
          return jsonResponse({ error: 'parent_doc_id not found' }, { status: 400 })
        }
      }
      if (field === 'featured_image_asset_id' && body.featured_image_asset_id) {
        const asset = await db.prepare('SELECT id FROM media_assets WHERE id = ? LIMIT 1').bind(body.featured_image_asset_id).first()
        if (!asset) {
          return jsonResponse({ error: 'featured_image_asset_id not found' }, { status: 400 })
        }
      }
      updates.push(`${field} = ?`)
      params.push(body[field])
    }
  }

  if (body.publish && body.unpublish) {
    return jsonResponse({ error: 'Cannot publish and unpublish simultaneously' }, { status: 400 })
  }
  if (body.publish) {
    updates.push('status = ?', 'published_at = ?')
    params.push('published', now)
  }
  if (body.unpublish) {
    updates.push('status = ?', 'published_at = NULL')
    params.push('draft')
  }

  params.push(docId)

  try {
    const doc = await db.prepare(
      `UPDATE platform_docs
       SET ${updates.join(', ')}
       WHERE id = ?
       RETURNING id, title, slug, body, excerpt, category, seo_description, seo_keywords, difficulty_level, sort_order, parent_doc_id, featured_image_asset_id, status, published_at, created_at, updated_at`
    ).bind(...params).first()

    if (!doc) {
      return jsonResponse({ error: 'Doc not found' }, { status: 404 })
    }

    return jsonResponse({ success: true, doc })
  } catch (err) {
    if (isSlugUniqueConstraintError(err)) {
      return jsonResponse({ error: 'Slug already in use' }, { status: 400 })
    }
    console.error('Failed to update doc:', err)
    return jsonResponse({ error: 'Failed to update doc' }, { status: 500 })
  }
})
