// POST /api/admin/docs - Create platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

const TITLE_MAX = 200
const BODY_MAX = 100000
const EXCERPT_MAX = 500
const SEO_DESCRIPTION_MAX = 500
const SEO_KEYWORDS_MAX = 500
const MAX_SLUG_ATTEMPTS = 8

function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

function isSlugUniqueConstraintError(err: ApiValue): boolean {
  const message = String((err as ApiValue)?.message || err || '')
  return message.includes('platform_docs.slug') || message.includes('UNIQUE constraint failed')
}

const VALID_CATEGORIES = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced']
const VALID_DIFFICULTY = ['Beginner', 'Intermediate', 'Advanced']

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
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
  }
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
  if (body.category && !VALID_CATEGORIES.includes(body.category)) {
    return jsonResponse({ error: `invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
  }
  if (body.seo_description && body.seo_description.length > SEO_DESCRIPTION_MAX) {
    return jsonResponse({ error: `seo_description exceeds maximum length (${SEO_DESCRIPTION_MAX})` }, { status: 400 })
  }
  if (body.seo_keywords && body.seo_keywords.length > SEO_KEYWORDS_MAX) {
    return jsonResponse({ error: `seo_keywords exceeds maximum length (${SEO_KEYWORDS_MAX})` }, { status: 400 })
  }
  if (body.difficulty_level && !VALID_DIFFICULTY.includes(body.difficulty_level)) {
    return jsonResponse({ error: `invalid difficulty_level. Must be one of: ${VALID_DIFFICULTY.join(', ')}` }, { status: 400 })
  }

  if (body.parent_doc_id) {
    const parentDoc = await db.prepare('SELECT id FROM platform_docs WHERE id = ? LIMIT 1').bind(body.parent_doc_id).first()
    if (!parentDoc) {
      return jsonResponse({ error: 'parent_doc_id not found' }, { status: 400 })
    }
  }

  if (body.featured_image_asset_id) {
    const asset = await db.prepare('SELECT id FROM media_assets WHERE id = ? LIMIT 1').bind(body.featured_image_asset_id).first()
    if (!asset) {
      return jsonResponse({ error: 'featured_image_asset_id not found' }, { status: 400 })
    }
  }

  const id = crypto.randomUUID()
  const baseSlug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  let slug = baseSlug
  if (!slug) {
    slug = `doc-${Date.now()}`
  }

  const now = new Date().toISOString()
  const userId = session.user.id
  const status = body.publish ? 'published' : 'draft'
  const publishedAt = body.publish ? now : null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidateSlug = attempt === 0 ? slug : `${slug}-${randomSlugSuffix()}`

    try {
      await db.prepare(
        `INSERT INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, parent_doc_id, featured_image_asset_id, status, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        body.title,
        candidateSlug,
        body.body,
        body.excerpt ?? null,
        body.category ?? null,
        userId,
        body.seo_description ?? null,
        body.seo_keywords ?? null,
        body.difficulty_level ?? null,
        body.sort_order ?? 0,
        body.parent_doc_id ?? null,
        body.featured_image_asset_id ?? null,
        status,
        publishedAt,
        now,
        now
      ).run()

      return jsonResponse({ success: true, id, slug: candidateSlug, status, published_at: publishedAt })
    } catch (err) {
      if (isSlugUniqueConstraintError(err) && attempt < MAX_SLUG_ATTEMPTS - 1) {
        continue
      }

      console.error('Failed to create doc:', err)
      return jsonResponse({ error: 'Failed to create doc' }, { status: 500 })
    }
  }

  return jsonResponse({ error: 'Failed to create doc' }, { status: 500 })
})
