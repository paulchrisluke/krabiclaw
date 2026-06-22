import slugify from 'slugify'

const BLOG_TITLE_MAX = 200
const BLOG_BODY_MAX = 100000
const BLOG_EXCERPT_MAX = 500
const BLOG_CATEGORY_MAX = 100
const DOC_TITLE_MAX = 200
const DOC_BODY_MAX = 100000
const DOC_EXCERPT_MAX = 500
const DOC_SEO_DESCRIPTION_MAX = 500
const DOC_SEO_KEYWORDS_MAX = 500
const MAX_SLUG_ATTEMPTS = 8

export const PLATFORM_DOC_CATEGORIES = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced'] as const
export const PLATFORM_DOC_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const

export interface PlatformBlogCreateInput {
  title: string
  body: string
  excerpt?: string | null
  category?: string | null
  publish?: boolean
}

export interface PlatformBlogUpdateInput {
  title?: string
  body?: string
  excerpt?: string | null
  category?: string | null
  publish?: boolean
  unpublish?: boolean
}

export interface PlatformDocCreateInput {
  title: string
  body: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  difficulty_level?: string | null
  sort_order?: number | null
  parent_doc_id?: string | null
  featured_image_asset_id?: string | null
  publish?: boolean
}

export interface PlatformDocUpdateInput extends Omit<PlatformDocCreateInput, 'title' | 'body'> {
  title?: string
  body?: string
  unpublish?: boolean
}

function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function notFound(message: string): never {
  throw createError({ statusCode: 404, statusMessage: message })
}

function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

function normalizeSlugFromTitle(title: string, fallbackPrefix: 'post' | 'doc') {
  const slug = slugify(title, { lower: true, strict: true, trim: true })
  return slug || `${fallbackPrefix}-${Date.now()}`
}

function isUniqueConstraintError(err: unknown, table: 'platform_blog_posts' | 'platform_docs') {
  const message = String((err as ApiValue)?.message || err || '')
  return message.includes(`${table}.slug`) || message.includes('UNIQUE constraint failed')
}

function assertStringLength(value: string | null | undefined, max: number, field: string) {
  if (value != null && value.length > max) {
    badRequest(`${field} exceeds maximum length (${max})`)
  }
}

async function ensureMediaAssetExists(db: D1Database, assetId: string) {
  const asset = await db.prepare('SELECT id FROM media_assets WHERE id = ? LIMIT 1').bind(assetId).first()
  if (!asset) badRequest('featured_image_asset_id not found')
}

async function ensureDocParentExists(db: D1Database, docId: string) {
  const doc = await db.prepare('SELECT id FROM platform_docs WHERE id = ? LIMIT 1').bind(docId).first()
  if (!doc) badRequest('parent_doc_id not found')
}

export async function listPlatformBlogPosts(db: D1Database, status?: string | null) {
  let sql = 'SELECT id, title, slug, excerpt, category, author_id, published_at, created_at, updated_at FROM platform_blog_posts'
  if (status === 'published') sql += ' WHERE published_at IS NOT NULL'
  else if (status === 'draft') sql += ' WHERE published_at IS NULL'
  sql += ' ORDER BY created_at DESC'
  const { results } = await db.prepare(sql).all()
  return results ?? []
}

export async function getPlatformBlogPost(db: D1Database, postId: string) {
  const post = await db.prepare(
    'SELECT id, title, slug, body, excerpt, category, published_at, created_at, updated_at FROM platform_blog_posts WHERE id = ?'
  ).bind(postId).first<ApiRecord | null>()
  if (!post) notFound('Post not found')
  return post
}

export async function createPlatformBlogPost(
  db: D1Database,
  authorId: string,
  input: PlatformBlogCreateInput,
) {
  if (!input.title || !input.body) badRequest('title and body are required')
  assertStringLength(input.title, BLOG_TITLE_MAX, 'title')
  assertStringLength(input.body, BLOG_BODY_MAX, 'body')
  assertStringLength(input.excerpt ?? null, BLOG_EXCERPT_MAX, 'excerpt')
  assertStringLength(input.category ?? null, BLOG_CATEGORY_MAX, 'category')

  const id = crypto.randomUUID()
  const slugBase = normalizeSlugFromTitle(input.title, 'post')
  const now = new Date().toISOString()
  const publishedAt = input.publish ? now : null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      await db.prepare(
        `INSERT INTO platform_blog_posts (id, title, slug, body, excerpt, category, author_id, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, input.title, slug, input.body, input.excerpt ?? null, input.category ?? null, authorId, publishedAt, now, now).run()
      return { success: true, id, slug, published_at: publishedAt }
    } catch (err) {
      if (isUniqueConstraintError(err, 'platform_blog_posts') && attempt < MAX_SLUG_ATTEMPTS - 1) continue
      throw err
    }
  }

  throw createError({ statusCode: 500, statusMessage: 'Failed to create post' })
}

export async function updatePlatformBlogPost(
  db: D1Database,
  postId: string,
  input: PlatformBlogUpdateInput,
) {
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [now]

  if (input.title !== undefined) {
    assertStringLength(input.title, BLOG_TITLE_MAX, 'title')
    if (!input.title?.trim()) badRequest('title cannot be blank')
    const slug = normalizeSlugFromTitle(input.title, 'post')
    const existing = await db.prepare(
      'SELECT id FROM platform_blog_posts WHERE slug = ? AND id != ? LIMIT 1'
    ).bind(slug, postId).first()
    if (existing) badRequest('Slug already in use')
    updates.push('title = ?', 'slug = ?')
    params.push(input.title, slug)
  }

  if (input.body !== undefined) {
    assertStringLength(input.body, BLOG_BODY_MAX, 'body')
    if (!input.body?.trim()) badRequest('body cannot be blank')
    updates.push('body = ?')
    params.push(input.body)
  }
  if (input.excerpt !== undefined) {
    assertStringLength(input.excerpt ?? null, BLOG_EXCERPT_MAX, 'excerpt')
    updates.push('excerpt = ?')
    params.push(input.excerpt)
  }
  if (input.category !== undefined) {
    assertStringLength(input.category ?? null, BLOG_CATEGORY_MAX, 'category')
    updates.push('category = ?')
    params.push(input.category)
  }

  if (input.publish && input.unpublish) badRequest('Cannot publish and unpublish simultaneously')
  if (input.publish) {
    updates.push('published_at = ?')
    params.push(now)
  }
  if (input.unpublish) {
    updates.push('published_at = NULL')
  }

  params.push(postId)

  try {
    const post = await db.prepare(
      `UPDATE platform_blog_posts
       SET ${updates.join(', ')}
       WHERE id = ?
       RETURNING id, title, slug, body, excerpt, category, published_at, created_at, updated_at`
    ).bind(...params).first()
    if (!post) notFound('Post not found')
    return { success: true, post }
  } catch (err) {
    if (isUniqueConstraintError(err, 'platform_blog_posts')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformBlogPost(db: D1Database, postId: string) {
  const result = await db.prepare('DELETE FROM platform_blog_posts WHERE id = ?').bind(postId).run()
  if (!result.meta.changes || result.meta.changes === 0) notFound('Post not found')
  return { success: true }
}

export async function listPlatformDocs(db: D1Database, status?: string | null) {
  let sql = 'SELECT id, title, slug, excerpt, category, author_id, difficulty_level, status, published_at, created_at, updated_at FROM platform_docs'
  if (status === 'published') sql += " WHERE status = 'published'"
  else if (status === 'draft') sql += " WHERE status = 'draft'"
  sql += ' ORDER BY category, sort_order, created_at DESC'
  const { results } = await db.prepare(sql).all()
  return results ?? []
}

export async function getPlatformDoc(db: D1Database, docId: string) {
  const doc = await db.prepare(
    `SELECT id, title, slug, body, excerpt, category, seo_description, seo_keywords, difficulty_level, sort_order, parent_doc_id, featured_image_asset_id, status, published_at, created_at, updated_at
     FROM platform_docs
     WHERE id = ?`
  ).bind(docId).first<ApiRecord | null>()
  if (!doc) notFound('Doc not found')
  return doc
}

function validateDocCommon(input: Partial<PlatformDocCreateInput>) {
  if (input.title !== undefined) assertStringLength(input.title, DOC_TITLE_MAX, 'title')
  if (input.body !== undefined) assertStringLength(input.body, DOC_BODY_MAX, 'body')
  if (input.excerpt !== undefined) assertStringLength(input.excerpt ?? null, DOC_EXCERPT_MAX, 'excerpt')
  if (input.seo_description !== undefined) assertStringLength(input.seo_description ?? null, DOC_SEO_DESCRIPTION_MAX, 'seo_description')
  if (input.seo_keywords !== undefined) assertStringLength(input.seo_keywords ?? null, DOC_SEO_KEYWORDS_MAX, 'seo_keywords')
  if (input.category && !PLATFORM_DOC_CATEGORIES.includes(input.category as (typeof PLATFORM_DOC_CATEGORIES)[number])) {
    badRequest(`invalid category. Must be one of: ${PLATFORM_DOC_CATEGORIES.join(', ')}`)
  }
  if (input.difficulty_level && !PLATFORM_DOC_DIFFICULTIES.includes(input.difficulty_level as (typeof PLATFORM_DOC_DIFFICULTIES)[number])) {
    badRequest(`invalid difficulty_level. Must be one of: ${PLATFORM_DOC_DIFFICULTIES.join(', ')}`)
  }
}

export async function createPlatformDoc(
  db: D1Database,
  authorId: string,
  input: PlatformDocCreateInput,
) {
  if (!input.title || !input.body) badRequest('title and body are required')
  validateDocCommon(input)
  if (input.parent_doc_id) await ensureDocParentExists(db, input.parent_doc_id)
  if (input.featured_image_asset_id) await ensureMediaAssetExists(db, input.featured_image_asset_id)

  const id = crypto.randomUUID()
  const slugBase = normalizeSlugFromTitle(input.title, 'doc')
  const now = new Date().toISOString()
  const status = input.publish ? 'published' : 'draft'
  const publishedAt = input.publish ? now : null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      await db.prepare(
        `INSERT INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, parent_doc_id, featured_image_asset_id, status, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        input.title,
        slug,
        input.body,
        input.excerpt ?? null,
        input.category ?? null,
        authorId,
        input.seo_description ?? null,
        input.seo_keywords ?? null,
        input.difficulty_level ?? null,
        input.sort_order ?? 0,
        input.parent_doc_id ?? null,
        input.featured_image_asset_id ?? null,
        status,
        publishedAt,
        now,
        now,
      ).run()
      return { success: true, id, slug, status, published_at: publishedAt }
    } catch (err) {
      if (isUniqueConstraintError(err, 'platform_docs') && attempt < MAX_SLUG_ATTEMPTS - 1) continue
      throw err
    }
  }

  throw createError({ statusCode: 500, statusMessage: 'Failed to create doc' })
}

export async function updatePlatformDoc(
  db: D1Database,
  docId: string,
  input: PlatformDocUpdateInput,
) {
  validateDocCommon(input)
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [now]

  if (input.title !== undefined) {
    if (!input.title?.trim()) badRequest('title cannot be blank')
    const slug = normalizeSlugFromTitle(input.title, 'doc')
    const existing = await db.prepare(
      'SELECT id FROM platform_docs WHERE slug = ? AND id != ? LIMIT 1'
    ).bind(slug, docId).first()
    if (existing) badRequest('Slug already in use')
    updates.push('title = ?', 'slug = ?')
    params.push(input.title, slug)
  }

  if (input.parent_doc_id !== undefined) {
    if (input.parent_doc_id === docId) badRequest('A document cannot be its own parent')
    if (input.parent_doc_id) await ensureDocParentExists(db, input.parent_doc_id)
  }
  if (input.featured_image_asset_id !== undefined && input.featured_image_asset_id) {
    await ensureMediaAssetExists(db, input.featured_image_asset_id)
  }

  const fields: Array<keyof Omit<PlatformDocUpdateInput, 'publish' | 'unpublish' | 'title'>> = [
    'body',
    'excerpt',
    'category',
    'seo_description',
    'seo_keywords',
    'difficulty_level',
    'sort_order',
    'parent_doc_id',
    'featured_image_asset_id',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      if (field === 'body' && !input.body?.trim()) badRequest('body cannot be blank')
      updates.push(`${field} = ?`)
      params.push(input[field] as ApiValue)
    }
  }

  if (input.publish && input.unpublish) badRequest('Cannot publish and unpublish simultaneously')
  if (input.publish) {
    updates.push('status = ?', 'published_at = ?')
    params.push('published', now)
  }
  if (input.unpublish) {
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
    if (!doc) notFound('Doc not found')
    return { success: true, doc }
  } catch (err) {
    if (isUniqueConstraintError(err, 'platform_docs')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformDoc(db: D1Database, docId: string) {
  const result = await db.prepare('DELETE FROM platform_docs WHERE id = ?').bind(docId).run()
  if (!result.meta.changes || result.meta.changes === 0) notFound('Doc not found')
  return { success: true }
}
