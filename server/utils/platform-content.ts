import { HTTPError } from 'nitro';

import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import {
  createContentDocumentWithBlocks,
  getContentEditorSnapshot,
  getContentBlocksForOwner,
  getContentDocumentByOwner,
  listBlocksForDocument,
  replaceContentDocumentBlocks,
  renderContentBlocksToMarkdown,
  type ContentDocumentOwnerType,
  type ContentBlockInput,
} from '~/server/utils/content-documents'
import { slugifyTitle } from '~/utils/post-slugs'
import { PLATFORM_MEDIA_SITE_ID } from '~/server/utils/platform-media'
import { BLOG_CATEGORY_LABELS, blogCategoryToSlug } from '~/utils/blog-categories'
import { categoryToSlug } from '~/utils/docs-categories'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { normalizeBlogSlug, parseScheduledFor, resolveBlogPublicPath, resolveSlugMutation } from '~/utils/blog-editor'
import { createBlogRedirect } from '~/server/utils/blog-publishing'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { buildReplaceMediaPlacementQueries } from '~/server/utils/media-asset-manager'
import { findAuthUsersByIds, type CloudflareEnv } from '~/server/utils/auth'
import { findOrganizationById } from '~/server/utils/member-access'

const BLOG_TITLE_MAX = 200
const BLOG_EXCERPT_MAX = 500
const BLOG_CATEGORY_MAX = 100
const BLOG_SEO_TITLE_MAX = 200
const BLOG_SEO_DESCRIPTION_MAX = 500
const BLOG_SEO_KEYWORDS_MAX = 500
const CONTENT_NAV_LABEL_MAX = 120
const CONTENT_NAV_TITLE_MAX = 160
const DOC_TITLE_MAX = 200
const DOC_EXCERPT_MAX = 500
const DOC_SEO_DESCRIPTION_MAX = 500
const DOC_SEO_KEYWORDS_MAX = 500
const MAX_SLUG_ATTEMPTS = 8
const BLOG_UPDATE_MUTATION_FIELDS: Array<keyof PlatformBlogUpdateInput> = [
  'title',
  'excerpt',
  'category',
  'tags',
  'nav_section',
  'nav_title',
  'nav_order',
  'nav_section_order',
  'hide_from_nav',
  'featured_order',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'canonical_url',
  'robots',
  'media',
  'visibility',
  'slug',
  'redirect_old_slug',
  'reset_slug_override',
  'content_blocks',
]

function parseStringArray(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) {
    if (value.some(item => typeof item !== 'string')) {
      throw new HTTPError({ statusCode: 500, statusMessage: 'Blog tags contain a non-string value' })
    }
    return value as string[]
  }
  if (typeof value !== 'string') {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Blog tags are not valid JSON' })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Blog tags are not valid JSON' })
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Blog tags are not an array of strings' })
  }
  return parsed as string[]
}

export function parseBlogEditorThemeTokens(value: string | null | undefined): ApiRecord {
  if (value === null || value === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Blog editor theme tokens are not valid JSON' })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Blog editor theme tokens must be a JSON object' })
  }
  return parsed as ApiRecord
}

export const PLATFORM_DOC_CATEGORIES = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced'] as const
export const PLATFORM_BLOG_CATEGORIES = BLOG_CATEGORY_LABELS
export const PLATFORM_DOC_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const

export type PlatformRobotsDirective = 'index,follow' | 'noindex,follow' | 'index,nofollow' | 'noindex,nofollow'

export const PLATFORM_ROBOTS_DIRECTIVES: readonly PlatformRobotsDirective[] = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']

function blogContentOwnerType(siteId: string | null): ContentDocumentOwnerType {
  return siteId ? 'tenant_blog' : 'platform_blog'
}

export interface PlatformContentNavInput {
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
  featured_order?: number | null
}

export interface BlogScope {
  site_id?: string | null
  organization_id?: string | null
}

export interface PlatformMediaInput {
  asset_id: string
  slot: 'featured'
}

function featuredAssetId(input: { media?: PlatformMediaInput[] }): string | null | undefined {
  if (input.media === undefined) return undefined
  if (!Array.isArray(input.media) || input.media.length > 1) badRequest('media accepts at most one featured asset')
  const item = input.media[0]
  if (!item) return null
  if (item.slot !== 'featured' || typeof item.asset_id !== 'string' || !item.asset_id.trim()) badRequest('media requires asset_id with slot featured')
  return item.asset_id.trim()
}

export interface PlatformDocNavGroupInput {
  nav_group?: string | null
  nav_group_order?: number | null
}

export interface PlatformBlogCreateInput extends PlatformContentNavInput {
  title: string
  slug?: string | null
  content_blocks: Array<ContentBlockInput & { id?: string }>
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  media?: PlatformMediaInput[]
  visibility?: 'public' | 'unlisted'
  scheduled_for?: string | null
}

export interface PlatformBlogUpdateInput extends PlatformContentNavInput {
  title?: string
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  media?: PlatformMediaInput[]
  visibility?: 'public' | 'unlisted'
  slug?: string | null
  redirect_old_slug?: boolean
  reset_slug_override?: boolean
  content_blocks?: Array<ContentBlockInput & { id?: string }>
  expected_document_updated_at?: string
  expected_updated_at?: string
}

export interface PlatformBlogLifecycleInput {
  expected_updated_at: string
  expected_document_updated_at: string
  scheduled_for?: string | null
}

export interface PlatformBlogLifecycleState {
  id: string
  status: 'published' | 'scheduled'
  published_at: string | null
  scheduled_for: string | null
  updated_at: string
  content_document_updated_at: string
}

export function parsePlatformBlogLifecycleInput(body: unknown, _action: 'publish' = 'publish'): PlatformBlogLifecycleInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) badRequest('Request body must be a valid object')
  const record = body as Record<string, unknown>
  const allowed = new Set(['expected_updated_at', 'expected_document_updated_at', 'scheduled_for'])
  const unknownField = Object.keys(record).find(key => !allowed.has(key))
  if (unknownField) badRequest(`Unknown request field: ${unknownField}`)
  if (typeof record.expected_updated_at !== 'string' || !record.expected_updated_at.trim()) badRequest('expected_updated_at is required')
  if (typeof record.expected_document_updated_at !== 'string' || !record.expected_document_updated_at.trim()) badRequest('expected_document_updated_at is required')
  if (record.scheduled_for !== undefined && record.scheduled_for !== null && typeof record.scheduled_for !== 'string') {
    badRequest('scheduled_for must be a string or null')
  }
  return {
    expected_updated_at: record.expected_updated_at,
    expected_document_updated_at: record.expected_document_updated_at,
    scheduled_for: record.scheduled_for as string | null | undefined,
  }
}

export interface PlatformDocCreateInput extends PlatformContentNavInput, PlatformDocNavGroupInput {
  title: string
  content_blocks: Array<ContentBlockInput & { id?: string }>
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  difficulty_level?: string | null
  sort_order?: number | null
  media?: PlatformMediaInput[]
}

export interface PlatformDocUpdateInput extends PlatformContentNavInput, PlatformDocNavGroupInput {
  title?: string
  content_blocks?: Array<ContentBlockInput & { id?: string }>
  expected_document_updated_at?: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  difficulty_level?: string | null
  sort_order?: number | null
  media?: PlatformMediaInput[]
}

function badRequest(message: string): never {
  throw new HTTPError({ statusCode: 400, statusMessage: message })
}

function notFound(message: string): never {
  throw new HTTPError({ statusCode: 404, statusMessage: message })
}

// Lets every blog/doc tool accept either the row id or its public slug, so a
// model (or person) holding only a public URL doesn't need a separate
// list-then-match step before it can get/update/publish/delete a post or doc.
async function resolvePlatformContentId(
  db: DbClient,
  table: 'blog_posts' | 'platform_docs',
  identifier: string,
  notFoundMessage: string,
  siteId: string | null = null,
): Promise<string> {
  const scope = table === 'blog_posts' ? (siteId ? ' AND site_id = ?' : ' AND site_id IS NULL') : ''
  const scopeParams = table === 'blog_posts' && siteId ? [siteId] : []
  const byId = await queryFirst<{ id: string }>(db, `SELECT id FROM ${table} WHERE id = ?${scope} LIMIT 1`, [identifier, ...scopeParams])
  const bySlug = await queryFirst<{ id: string }>(db, `SELECT id FROM ${table} WHERE slug = ?${scope} LIMIT 1`, [identifier, ...scopeParams])
  if (byId && bySlug && byId.id !== bySlug.id) {
    badRequest('Ambiguous platform content identifier; use the row id.')
  }
  const row = byId ?? bySlug
  if (!row) notFound(notFoundMessage)
  return row.id
}

function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

function normalizeSlugFromTitle(title: string, fallbackPrefix: 'post' | 'doc') {
  const slug = slugifyTitle(title)
  return slug || `${fallbackPrefix}-${Date.now()}`
}

function isUniqueConstraintError(err: unknown, table: 'blog_posts' | 'platform_docs') {
  const message = String((err as ApiValue)?.message || err || '')
  const normalized = message.replace(/["'`]/g, '')
  if (table === 'blog_posts') return normalized.includes('blog_posts.slug')
  return normalized.includes('platform_docs.slug')
}

function assertStringLength(value: string | null | undefined, max: number, field: string) {
  if (value != null && value.length > max) {
    badRequest(`${field} exceeds maximum length (${max})`)
  }
}

function assertValidRobotsDirective(value: string | null | undefined) {
  if (value == null) return
  if (!PLATFORM_ROBOTS_DIRECTIVES.includes(value as PlatformRobotsDirective)) {
    badRequest(`robots must be one of: ${PLATFORM_ROBOTS_DIRECTIVES.join(', ')}`)
  }
}

function assertValidBlogCategory(value: string | null | undefined) {
  if (value == null || value === '') return
  if (!PLATFORM_BLOG_CATEGORIES.includes(value)) {
    badRequest(`category must be one of: ${PLATFORM_BLOG_CATEGORIES.join(', ')}`)
  }
}

function assertValidCanonicalUrl(value: string | null | undefined) {
  if (value == null || value === '') return
  try {
    void new URL(value)
  } catch {
    badRequest('canonical_url must be an absolute URL')
  }
}

async function ensureRenderableMediaAssetExists(
  db: D1Database,
  assetId: string,
  field = 'media.asset_id',
  siteId: string | null = null,
) {
  const scopedSiteId = siteId ?? PLATFORM_MEDIA_SITE_ID
  const conditions = ['id = ?', 'status = ?', "kind IN ('image', 'video')"]
  const params: ApiValue[] = [assetId, 'active']
  conditions.push('site_id = ?')
  params.push(scopedSiteId)

  const asset = await queryFirst(db, `SELECT id FROM media_assets WHERE ${conditions.join(' AND ')} LIMIT 1`, params)
  if (!asset) {
    badRequest(siteId ? `${field} must reference active visual media from this site` : `${field} must reference active platform visual media`)
  }
}

async function mediaPlacementScope(db: DbClient, siteId: string | null, organizationId: string | null) {
  if (siteId && organizationId) return { siteId, organizationId }
  // A siteId without its organizationId is a caller bug (every real tenant caller
  // resolves both together from the same site row) — it must fail loudly rather
  // than silently fall through to platform scope, which would misfile tenant media
  // as platform-owned.
  if (siteId) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant media placement requires an organization id' })
  const platformSite = await queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM sites WHERE id = ? LIMIT 1', [PLATFORM_MEDIA_SITE_ID])
  if (!platformSite) throw new HTTPError({ statusCode: 500, statusMessage: 'Platform media site is not configured' })
  return { siteId: PLATFORM_MEDIA_SITE_ID, organizationId: platformSite.organization_id }
}

type NormalizedEditorBlock = ContentBlockInput & { id: string; placement_media: Array<{ asset_id: string; slot: string }> }

async function normalizeEditorContentBlocks(db: D1Database, blocks: Array<ContentBlockInput & { id?: string }>, siteId: string | null): Promise<NormalizedEditorBlock[]> {
  return await Promise.all(blocks.map(async (block): Promise<NormalizedEditorBlock> => {
    if (!block || typeof block !== 'object' || !block.data || typeof block.data !== 'object' || Array.isArray(block.data)) badRequest('Every content block requires an object data payload')
    if (block.type === 'heading' && (typeof block.data.text !== 'string' || !block.data.text.trim())) badRequest('Heading blocks require non-empty data.text')
    if (block.type === 'markdown') {
      if (typeof block.data.markdown !== 'string') badRequest('Markdown blocks require data.markdown')
      if (block.data.editor_mode !== 'rich' && block.data.editor_mode !== 'source') badRequest('Markdown blocks require data.editor_mode to be rich or source')
      if (block.data.editor_mode === 'rich' && (/^\s*\|.*\|\s*$/m.test(block.data.markdown) || /<\/?[a-z][^>]*>/i.test(block.data.markdown))) {
        badRequest('Markdown tables and raw HTML require editor_mode source')
      }
    }
    const id = block.id ?? crypto.randomUUID()
    const media = Array.isArray(block.media) ? block.media : []
    if (block.type === 'image' && media.length > 1) badRequest('Image blocks accept one media asset')
    const placementMedia = await Promise.all(media.map(async (item, index) => {
      const assetId = typeof item?.asset_id === 'string' ? item.asset_id.trim() : ''
      if (!assetId) badRequest(`content_blocks media[${index}].asset_id is required`)
      await ensureRenderableMediaAssetExists(db, assetId, `content block media[${index}].asset_id`, siteId)
      return { asset_id: assetId, slot: typeof item.slot === 'string' && item.slot.trim() ? item.slot.trim() : block.type === 'gallery' ? 'gallery' : 'media' }
    }))
    const data = { ...block.data }
    if (block.type === 'image' && !placementMedia.length) return { ...block, id, data, media: [], placement_media: [] }
    return { ...block, id, data, media: placementMedia, placement_media: placementMedia }
  }))
}

function contentBlockPlacementQueries(
  blocks: NormalizedEditorBlock[],
  scope: { organizationId: string; siteId: string },
  now?: string,
) {
  return blocks.flatMap((block) => {
    const bySlot = new Map<string, Array<{ asset_id: string }>>()
    for (const item of block.placement_media) {
      const items = bySlot.get(item.slot) ?? []
      items.push({ asset_id: item.asset_id })
      bySlot.set(item.slot, items)
    }
    return [
      {
        query: 'DELETE FROM media_placements WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ?',
        params: [scope.organizationId, scope.siteId, 'content_block', block.id],
      },
      ...[...bySlot.keys()].flatMap(slot => buildReplaceMediaPlacementQueries({
        ...scope,
        placement: { owner_type: 'content_block', owner_id: block.id, slot },
        media: bySlot.get(slot) ?? [],
        now,
      })),
    ]
  })
}

function renderCanonicalBlogBody(blocks: Array<ContentBlockInput & { id?: string }>) {
  return renderContentBlocksToMarkdown(blocks.map((block, position) => ({
    id: block.id ?? `pending-${position}`,
    type: block.type,
    position,
    level: block.level ?? null,
    data_json: JSON.stringify(block.data),
  })))
}

function attachPublished(record: ApiRecord, published: boolean) {
  return { ...record, published }
}

async function normalizeCanonicalBlogBlocks(
  db: D1Database,
  input: Pick<PlatformBlogCreateInput, 'content_blocks'>,
  siteId: string | null,
) {
  if (!Array.isArray(input.content_blocks) || !input.content_blocks.length) badRequest('content_blocks are required')
  return await normalizeEditorContentBlocks(db, input.content_blocks, siteId)
}

function normalizeNavVisibility<T extends Record<string, unknown>>(record: T) {
  const normalized = { ...record } as T & { tags?: string[]; tags_json?: unknown }
  if ('tags_json' in record) {
    normalized.tags = parseStringArray(record.tags_json)
    delete normalized.tags_json
  }
  if (!('hide_from_nav' in record)) return normalized
  return {
    ...normalized,
    hide_from_nav: Boolean(record.hide_from_nav),
  }
}

export function attachFeaturedMedia(record: ApiRecord) {
  const {
    asset_id: assetId,
    media_public_url: publicUrl,
    media_thumbnail_url: thumbnailUrl,
    media_kind: kind,
    media_width: width,
    media_height: height,
    ...rest
  } = record

  return {
    ...normalizeNavVisibility(rest),
    media: assetId ? [{ asset_id: assetId, slot: 'featured', public_url: publicUrl ?? null, thumbnail_url: thumbnailUrl ?? null, kind: kind ?? null, width: width ?? null, height: height ?? null }] : [],
  }
}

export function attachFeaturedMediaFromBareJoin(record: ApiRecord) {
  const {
    public_url: publicUrl, thumbnail_url: thumbnailUrl, kind, width, height, asset_id: assetId,
    ...rest
  } = record

  return {
    ...normalizeNavVisibility(rest),
    media: assetId ? [{ asset_id: assetId, slot: 'featured', public_url: publicUrl ?? null, thumbnail_url: thumbnailUrl ?? null, kind: kind ?? null, width: width ?? null, height: height ?? null }] : [],
  }
}

export type ContentReviewContext =
  | { scope: 'platform' }
  | { scope: 'tenant'; orgSlug: string; siteSlug: string }

function contentReviewUrls(
  record: ApiRecord,
  kind: 'blog' | 'doc',
  siteId: string | null = null,
  tenantBlogPath: string | null = null,
  context?: ContentReviewContext,
) {
  const id = String(record.id ?? '')
  const adminEditUrl = (() => {
    if (kind === 'doc') return `/admin/docs/${id}`
    if (context?.scope === 'tenant') {
      return `/dashboard/${context.orgSlug}/sites/${context.siteSlug}/blog/${id}`
    }
    return `/admin/blog/${id}`
  })()
  const isPublished = typeof record.status === 'string' ? record.status === 'published' : Boolean(record.published_at)
  const category = typeof record.category === 'string' ? record.category : null
  const slug = typeof record.slug === 'string' ? record.slug : null
  const categorySlug = kind === 'blog' ? blogCategoryToSlug(category) : categoryToSlug(category)
  const publicPath = (() => {
    if (!slug) return null
    if (kind === 'blog') {
      if (siteId) return tenantBlogPath ?? `/blog/${slug}`
      return resolveBlogPublicPath({ scope: 'platform', slug, category })
    }
    return categorySlug ? `/docs/${categorySlug}/${slug}` : null
  })()

  return {
    ...record,
    admin_edit_url: adminEditUrl,
    edit_url: adminEditUrl,
    public_path: publicPath,
    public_url: isPublished ? publicPath : null,
    preview_url: null,
  }
}

function platformDocReviewUrls(record: ApiRecord) {
  const projected = contentReviewUrls({ ...record, status: 'published' }, 'doc')
  const { status: _status, published_at: _publishedAt, preview_url: _previewUrl, ...doc } = projected
  return doc
}

async function resolveTenantBlogPostPath(db: DbClient, siteId: string | null, slug: string) {
  if (!siteId) return null
  const site = await queryFirst<{ theme: string | null; theme_id: string | null }>(
    db,
    'SELECT theme, theme_id FROM sites WHERE id = ? LIMIT 1',
    [siteId],
  )
  return tenantBlogPostPath(site, slug)
}

async function resolveTenantContext(db: DbClient, siteId: string | null, env?: CloudflareEnv): Promise<ContentReviewContext | undefined> {
  if (!siteId) return undefined
  if (!env) throw new Error('CloudflareEnv is required to resolve tenant organization context')
  const site = await queryFirst<{ slug: string; organization_id: string }>(
    db,
    'SELECT slug, organization_id FROM sites WHERE id = ? LIMIT 1',
    [siteId],
  )
  if (!site) return undefined
  const organization = await findOrganizationById(env, site.organization_id)
  if (!organization) return undefined
  return { scope: 'tenant', orgSlug: organization.slug, siteSlug: site.slug }
}

/**
 * Shared by the public blog API route and the blog page's SSR data fetch.
 * The page must call this directly (with its own request's `db` binding)
 * rather than doing a nested self-fetch back to the API route — Nitro's
 * internal dispatch for multi-segment dynamic routes does not reliably
 * reproduce the same route-param/binding resolution as a real external
 * request, which was causing the page to 404 on posts the API itself
 * served fine.
 */
export async function getPublishedPlatformBlogPost(db: DbClient, category: string, slug: string, env: CloudflareEnv) {
  const post = await queryFirst<ApiRecord>(db, `
    SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.tags_json, p.seo_title, p.seo_description, p.seo_keywords,
      p.canonical_url, p.robots, p.visibility,
      p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.hide_from_nav, p.featured_order,
      p.published_at, p.created_at, p.updated_at,
      p.author_id,
      mp.asset_id AS asset_id,
      ma.public_url,
      ma.thumbnail_url,
      ma.kind,
      ma.width,
      ma.height
    FROM blog_posts p
    LEFT JOIN media_placements mp ON mp.owner_type = 'blog_post' AND mp.owner_id = p.id AND mp.slot = 'featured' AND mp.sort_order = 0
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
    WHERE p.slug = ? AND p.category = ? AND p.status = 'published' AND p.site_id IS NULL
  `, [slug, category])

  if (!post) return null

  const contentBlocks = await getContentBlocksForOwner(db, 'platform_blog', String(post.id))
  if (!contentBlocks) throw new HTTPError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  const { author_id: authorId, ...postRecord } = post
  const authors = await findAuthUsersByIds(env, [authorId as string | null])
  const author = typeof authorId === 'string' ? authors.get(authorId) ?? null : null
  return {
    ...attachFeaturedMediaFromBareJoin({ ...postRecord, content_blocks: contentBlocks }),
    author: author ? { id: author.id, name: author.name, image: author.image } : null,
  }
}

/**
 * Shared by the public docs API route and the docs page's SSR data fetch.
 * See getPublishedPlatformBlogPost above for why the page must call this
 * directly rather than doing a nested self-fetch back to the API route.
 */
export async function getPublishedPlatformDoc(db: DbClient, category: string, slug: string, env: CloudflareEnv) {
  const doc = await queryFirst<ApiRecord>(
    db,
    `SELECT
       p.id, p.title, p.slug, p.excerpt, p.category, p.difficulty_level,
       p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
       p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.nav_group, p.nav_group_order, p.hide_from_nav, p.featured_order,
       p.author_id,
       mp.asset_id AS asset_id, p.updated_at,
       ma.public_url, ma.thumbnail_url, ma.kind, ma.width, ma.height
     FROM platform_docs p
     LEFT JOIN media_placements mp ON mp.owner_type = 'platform_doc' AND mp.owner_id = p.id AND mp.slot = 'featured' AND mp.sort_order = 0
     LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
     WHERE p.slug = ? AND p.category = ?`,
    [slug, category],
  )

  if (!doc) return null

  const contentBlocks = await getContentBlocksForOwner(db, 'platform_doc', String(doc.id))
  if (!contentBlocks) throw new HTTPError({ statusCode: 500, statusMessage: 'Documentation content document is missing' })
  const { author_id: authorId, ...docRecord } = doc
  const authors = await findAuthUsersByIds(env, [authorId as string | null])
  const author = typeof authorId === 'string' ? authors.get(authorId) ?? null : null
  return {
    ...attachFeaturedMediaFromBareJoin({ ...docRecord, content_blocks: contentBlocks }),
    author: author ? { id: author.id, name: author.name, image: author.image } : null,
  }
}

function normalizeBlankToNull(input: { canonical_url?: string | null; robots?: string | null }) {
  if (input.canonical_url !== undefined && input.canonical_url?.trim() === '') input.canonical_url = null
  if (input.robots !== undefined && input.robots?.trim() === '') input.robots = null
}

function validateNavMetadata(input: Partial<PlatformContentNavInput>) {
  if (input.nav_section !== undefined) assertStringLength(input.nav_section ?? null, CONTENT_NAV_LABEL_MAX, 'nav_section')
  if (input.nav_title !== undefined) assertStringLength(input.nav_title ?? null, CONTENT_NAV_TITLE_MAX, 'nav_title')
  for (const field of ['nav_order', 'nav_section_order', 'featured_order'] as const) {
    if (input[field] !== undefined && input[field] !== null) {
      const value = input[field]
      if (typeof value !== 'string' && typeof value !== 'number') {
        badRequest(`${field} must be a number or numeric string`)
      }
      if (typeof value === 'string' && !/^-?\d+$/.test(value)) {
        badRequest(`${field} must be a number or numeric string`)
      }
      if (typeof value === 'number' && !Number.isInteger(value)) {
        badRequest(`${field} must be an integer`)
      }
    }
  }
}

function validateDocNavGroupMetadata(input: Partial<PlatformDocNavGroupInput>) {
  if (input.nav_group !== undefined) assertStringLength(input.nav_group ?? null, CONTENT_NAV_LABEL_MAX, 'nav_group')
  if (input.nav_group_order !== undefined && input.nav_group_order !== null && !Number.isInteger(input.nav_group_order)) {
    badRequest('nav_group_order must be an integer')
  }
}

function normalizeHideFromNav(value: PlatformContentNavInput['hide_from_nav']) {
  if (value === undefined || value === null) return value
  return value ? 1 : 0
}

function hasOwnField<T extends object>(input: T, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(input, key)
}

// The fixed PLATFORM_BLOG_CATEGORIES taxonomy (Marketing, SEO, ...) only makes sense
// for KrabiClaw's own marketing blog — a tenant restaurant's blog category is free text.
function validateBlogCommon(input: Partial<PlatformBlogCreateInput>, isTenant = false) {
  normalizeBlankToNull(input)
  validateNavMetadata(input)
  if (input.title !== undefined) assertStringLength(input.title, BLOG_TITLE_MAX, 'title')
  if (input.excerpt !== undefined) assertStringLength(input.excerpt ?? null, BLOG_EXCERPT_MAX, 'excerpt')
  if (input.category !== undefined) {
    assertStringLength(input.category ?? null, BLOG_CATEGORY_MAX, 'category')
    if (!isTenant) assertValidBlogCategory(input.category ?? null)
  }
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) badRequest('tags must be an array of non-empty strings up to 80 characters each')
    input.tags = [...new Set(input.tags.map(tag => tag.trim()))].slice(0, 20)
  }
  if (input.seo_title !== undefined) assertStringLength(input.seo_title ?? null, BLOG_SEO_TITLE_MAX, 'seo_title')
  if (input.seo_description !== undefined) assertStringLength(input.seo_description ?? null, BLOG_SEO_DESCRIPTION_MAX, 'seo_description')
  if (input.seo_keywords !== undefined) assertStringLength(input.seo_keywords ?? null, BLOG_SEO_KEYWORDS_MAX, 'seo_keywords')
  if (input.canonical_url !== undefined) assertValidCanonicalUrl(input.canonical_url)
  if (input.robots !== undefined) assertValidRobotsDirective(input.robots)
}

function rejectLegacyBlogContentFields(input: object) {
  const fields = ['body', 'components', 'faq_items', 'faq_label', 'faq_status', 'faq_render_enabled', 'faq_schema_enabled', 'how_to_steps', 'how_to_estimated_time', 'how_to_tool_items', 'how_to_supply_items', 'how_to_label', 'how_to_status', 'how_to_render_enabled', 'how_to_schema_enabled']
  const legacy = fields.find(field => Object.prototype.hasOwnProperty.call(input, field))
  if (legacy) badRequest(`${legacy} is not writable for blogs; use content_blocks`)
}

function rejectBlogUpdateLifecycleFields(input: object) {
  const lifecycleField = ['scheduled_for']
    .find(field => Object.prototype.hasOwnProperty.call(input, field))
  if (lifecycleField) {
    badRequest(`${lifecycleField} is not writable through a blog update; use the publish operation for scheduled articles`)
  }
}

function validateDocCommon(input: Partial<PlatformDocCreateInput>) {
  normalizeBlankToNull(input)
  validateNavMetadata(input)
  validateDocNavGroupMetadata(input)
  if (input.title !== undefined) assertStringLength(input.title, DOC_TITLE_MAX, 'title')
  if (input.excerpt !== undefined) assertStringLength(input.excerpt ?? null, DOC_EXCERPT_MAX, 'excerpt')
  if (input.seo_description !== undefined) assertStringLength(input.seo_description ?? null, DOC_SEO_DESCRIPTION_MAX, 'seo_description')
  if (input.seo_keywords !== undefined) assertStringLength(input.seo_keywords ?? null, DOC_SEO_KEYWORDS_MAX, 'seo_keywords')
  if (input.canonical_url !== undefined) assertValidCanonicalUrl(input.canonical_url)
  if (input.robots !== undefined) assertValidRobotsDirective(input.robots)
  if (input.category && !PLATFORM_DOC_CATEGORIES.includes(input.category as (typeof PLATFORM_DOC_CATEGORIES)[number])) {
    badRequest(`invalid category. Must be one of: ${PLATFORM_DOC_CATEGORIES.join(', ')}`)
  }
  if (input.difficulty_level && !PLATFORM_DOC_DIFFICULTIES.includes(input.difficulty_level as (typeof PLATFORM_DOC_DIFFICULTIES)[number])) {
    badRequest(`invalid difficulty_level. Must be one of: ${PLATFORM_DOC_DIFFICULTIES.join(', ')}`)
  }
}

export async function listPlatformBlogPosts(db: DbClient, status?: string | null, siteId: string | null = null, env?: CloudflareEnv) {
  let sql = `SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.tags_json, p.status, p.visibility, p.scheduled_for,
      p.seo_title, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
      p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.hide_from_nav, p.featured_order,
      mp.asset_id AS asset_id, ma.public_url AS media_public_url, ma.thumbnail_url AS media_thumbnail_url, ma.kind AS media_kind,
      ma.width AS media_width, ma.height AS media_height,
      p.published_at, p.created_at, p.updated_at
    FROM blog_posts p
    LEFT JOIN media_placements mp ON mp.owner_type = 'blog_post' AND mp.owner_id = p.id AND mp.slot = 'featured' AND mp.sort_order = 0
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
    WHERE ${siteId ? 'p.site_id = ?' : 'p.site_id IS NULL'}`
  const params: ApiValue[] = siteId ? [siteId] : []
  if (status === 'published') sql += " AND p.status = 'published'"
  else if (status === 'scheduled') sql += " AND p.status = 'scheduled'"
  sql += ' ORDER BY COALESCE(p.featured_order, 999999), COALESCE(p.nav_section_order, 999999), COALESCE(p.nav_section, p.category), COALESCE(p.nav_order, 999999), p.created_at DESC'
  const results = await queryAll<ApiRecord>(db, sql, params)
  const context = await resolveTenantContext(db, siteId, env)
  const site = siteId
    ? await queryFirst<{ theme: string | null; theme_id: string | null }>(db, 'SELECT theme, theme_id FROM sites WHERE id = ? LIMIT 1', [siteId])
    : null
  return (results ?? []).map((record) => {
    const slug = typeof record.slug === 'string' ? record.slug : ''
    const publicPath = siteId && slug ? tenantBlogPostPath(site, slug) : null
    return contentReviewUrls(attachFeaturedMedia(attachPublished(record, Boolean(record.published_at))), 'blog', siteId, publicPath, context)
  })
}

export async function getPlatformBlogPost(db: DbClient, postIdOrSlug: string, siteId: string | null = null, env?: CloudflareEnv) {
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const post = await queryFirst<ApiRecord | null>(
    db,
    `SELECT
       p.id, p.title, p.slug, p.excerpt, p.category, p.tags_json, p.status, p.visibility, p.scheduled_for,
       p.first_published_at, p.slug_manually_overridden,
       p.seo_title, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
       p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.hide_from_nav, p.featured_order,
       mp.asset_id AS asset_id, ma.public_url AS media_public_url, ma.thumbnail_url AS media_thumbnail_url, ma.kind AS media_kind,
       ma.width AS media_width, ma.height AS media_height,
       p.published_at, p.created_at, p.updated_at
     FROM blog_posts p
     LEFT JOIN media_placements mp ON mp.owner_type = 'blog_post' AND mp.owner_id = p.id AND mp.slot = 'featured' AND mp.sort_order = 0
     LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
     WHERE p.id = ?`,
    [postId],
  )
  if (!post) notFound('Post not found')
  const contentDocument = await getContentEditorSnapshot(db, blogContentOwnerType(siteId), postId)
  if (!contentDocument) throw new HTTPError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  const rawBlocks = await listBlocksForDocument(db, contentDocument.document.id)
  const slug = typeof post.slug === 'string' ? post.slug : ''
  const publicPath = siteId && slug ? await resolveTenantBlogPostPath(db, siteId, slug) : null
  const context = await resolveTenantContext(db, siteId, env)
  const editorTheme = siteId ? await queryFirst<{ theme: string | null; theme_id: string | null; vertical: string | null; brand_name: string | null; brand_color: string | null } | null>(db, `
    SELECT s.theme, s.theme_id, s.vertical, s.brand_name,
           (SELECT sc.value FROM site_config sc WHERE sc.site_id = s.id AND sc.key = 'brand_color' LIMIT 1) AS brand_color
      FROM sites s
     WHERE s.id = ? LIMIT 1
  `, [siteId]) : null
  const editorTemplate = siteId ? resolvePublicTemplate({ theme: editorTheme?.theme, themeId: editorTheme?.theme_id, vertical: editorTheme?.vertical }) : null
  const editorThemeTokenRow = siteId && editorTemplate ? await queryFirst<{ tokens_json: string | null } | null>(db, `
    SELECT tokens_json FROM site_theme_tokens
     WHERE site_id = ? AND template_slug = ? AND status = 'active'
     LIMIT 1
  `, [siteId, editorTemplate.slug]) : null
  const editorThemeTokens = parseBlogEditorThemeTokens(editorThemeTokenRow?.tokens_json)
  return {
    ...contentReviewUrls(attachFeaturedMedia(attachPublished(post, Boolean(post.published_at))), 'blog', siteId, publicPath, context),
    tags: parseStringArray(post.tags_json),
    body: renderContentBlocksToMarkdown(rawBlocks),
    content_document: contentDocument,
    editor_template: editorTemplate?.slug ?? 'platform',
    editor_theme_tokens: editorThemeTokens,
    editor_site_name: siteId ? (editorTheme?.brand_name || '') : 'KrabiClaw',
    editor_brand_color: editorTheme?.brand_color ?? null,
  }
}

export async function getPublishedSiteBlogPost(db: DbClient, siteId: string, slug: string, env: CloudflareEnv) {
  const post = await queryFirst<ApiRecord>(db, `
    SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.tags_json, p.seo_title, p.seo_description, p.seo_keywords,
      p.canonical_url, p.robots, p.featured_order, p.visibility,
      p.published_at, p.created_at, p.updated_at,
      p.author_id,
      mp.asset_id AS asset_id,
      ma.public_url,
      ma.thumbnail_url,
      ma.kind,
      ma.width,
      ma.height
    FROM blog_posts p
    LEFT JOIN media_placements mp ON mp.owner_type = 'blog_post' AND mp.owner_id = p.id AND mp.slot = 'featured' AND mp.sort_order = 0
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
    WHERE p.slug = ? AND p.site_id = ? AND p.status = 'published'
      AND (p.scheduled_for IS NULL OR p.scheduled_for <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    LIMIT 1
  `, [slug, siteId])

  if (!post) return null

  const contentDocument = await getContentDocumentByOwner(db, 'tenant_blog', String(post.id))
  if (!contentDocument) throw new HTTPError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  const [contentBlocks, rawBlocks] = await Promise.all([
    getContentBlocksForOwner(db, 'tenant_blog', String(post.id)),
    listBlocksForDocument(db, contentDocument.id),
  ])
  const { author_id: authorId, ...postRecord } = post
  const authors = await findAuthUsersByIds(env, [authorId as string | null])
  const author = typeof authorId === 'string' ? authors.get(authorId) ?? null : null
  return {
    ...attachFeaturedMediaFromBareJoin({ ...postRecord, content_blocks: contentBlocks ?? [], body: renderContentBlocksToMarkdown(rawBlocks) }),
    author: author ? { id: author.id, name: author.name, image: author.image } : null,
  }
}

export async function createPlatformBlogPost(
  db: D1Database,
  authorId: string,
  input: PlatformBlogCreateInput,
  scope: BlogScope = {},
  env?: CloudflareEnv,
) {
  rejectLegacyBlogContentFields(input)
  if (!input.title?.trim()) badRequest('title is required')
  const isTenant = Boolean(scope.site_id)
  validateBlogCommon(input, isTenant)
  if (!isTenant) {
    if (!input.category?.trim()) badRequest('category is required')
    assertValidBlogCategory(input.category)
  }
  const featuredId = featuredAssetId(input)
  if (featuredId) await ensureRenderableMediaAssetExists(db, featuredId, 'media', scope.site_id ?? null)

  const siteId = scope.site_id ?? null
  const organizationId = scope.organization_id ?? null
  const id = crypto.randomUUID()
  const customSlug = typeof input.slug === 'string' && input.slug.trim()
    ? normalizeBlogSlug(input.slug)
    : null
  const slugBase = customSlug ?? normalizeSlugFromTitle(input.title, 'post')
  const now = new Date().toISOString()
  let scheduledFor: string | null = null
  try { scheduledFor = parseScheduledFor(input.scheduled_for) } catch (error) { badRequest((error as Error).message) }
  if (scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) badRequest('scheduled_for must be in the future')
  const status = scheduledFor ? 'scheduled' : 'published'
  const publishedAt = scheduledFor ? null : now
  if (input.visibility && !['public', 'unlisted'].includes(input.visibility)) badRequest('visibility must be public or unlisted')
  const canonicalBlocks = await normalizeCanonicalBlogBlocks(db, input, siteId)
  const canonicalBody = renderCanonicalBlogBody(canonicalBlocks)
  const placementScope = await mediaPlacementScope(db, siteId, organizationId)

  const slugAttempts = customSlug ? 1 : MAX_SLUG_ATTEMPTS
  for (let attempt = 0; attempt < slugAttempts; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      const blogPostInsert: BatchQuery = {
        query: `
        INSERT INTO blog_posts (id, organization_id, site_id, title, slug, excerpt, category, tags_json, nav_section, nav_title, nav_order, nav_section_order, hide_from_nav, featured_order, status, visibility, scheduled_for, slug_manually_overridden, seo_title, seo_description, seo_keywords, canonical_url, robots, author_id, published_at, first_published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          organizationId,
          siteId,
          input.title,
          slug,
          input.excerpt ?? null,
          input.category ?? null,
          input.tags ? JSON.stringify(input.tags) : null,
          input.nav_section ?? null,
          input.nav_title ?? null,
          input.nav_order != null ? Number(input.nav_order) : null,
          input.nav_section_order != null ? Number(input.nav_section_order) : null,
          normalizeHideFromNav(input.hide_from_nav) ?? 0,
          input.featured_order != null ? Number(input.featured_order) : null,
          status,
          input.visibility ?? 'public',
          scheduledFor,
          customSlug ? 1 : 0,
          input.seo_title ?? null,
          input.seo_description ?? null,
          input.seo_keywords ?? null,
          input.canonical_url ?? null,
          input.robots ?? null,
          authorId,
          publishedAt,
          publishedAt,
          now,
          now,
        ],
      }

      const ownerType = blogContentOwnerType(siteId)
      await createContentDocumentWithBlocks(db, ownerType, id, canonicalBlocks, {
        bodyMarkdown: canonicalBody,
        additionalQueriesBefore: [blogPostInsert],
        additionalQueriesAfter: [
          ...buildReplaceMediaPlacementQueries({ organizationId: placementScope.organizationId, siteId: placementScope.siteId, placement: { owner_type: 'blog_post', owner_id: id, slot: 'featured' }, media: featuredId ? [{ asset_id: featuredId }] : [], now }),
          ...contentBlockPlacementQueries(canonicalBlocks, placementScope, now),
        ],
      })
      const post = await getPlatformBlogPost(db, id, siteId, env)
      return {
        success: true,
        id,
        slug,
        published_at: publishedAt,
        admin_edit_url: post.admin_edit_url,
        edit_url: post.edit_url,
        public_path: post.public_path,
        public_url: post.public_url,
        preview_url: post.preview_url,
        post,
      }
    } catch (err) {
      if (customSlug && isUniqueConstraintError(err, 'blog_posts')) badRequest('slug is already in use')
      if (isUniqueConstraintError(err, 'blog_posts') && attempt < slugAttempts - 1) continue
      throw err
    }
  }

  throw new HTTPError({ statusCode: 500, statusMessage: 'Failed to create post' })
}

export async function updatePlatformBlogLifecycle(
  db: D1Database,
  postIdOrSlug: string,
  input: PlatformBlogLifecycleInput,
  siteId: string | null = null,
): Promise<PlatformBlogLifecycleState> {
  if (!input.expected_updated_at?.trim()) badRequest('expected_updated_at is required')
  if (!input.expected_document_updated_at?.trim()) badRequest('expected_document_updated_at is required')

  let scheduledFor: string | null = null
  try { scheduledFor = parseScheduledFor(input.scheduled_for) } catch (error) { badRequest((error as Error).message) }
  if (scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) badRequest('scheduled_for must be in the future')

  type LifecycleSource = {
    id: string
    status: string
    updated_at: string
    document_id: string | null
    document_updated_at: string | null
  }
  const rows = await queryAll<LifecycleSource>(db, `
    SELECT p.id, p.status, p.updated_at,
           d.id AS document_id,
           d.updated_at AS document_updated_at
      FROM blog_posts p
      LEFT JOIN content_documents d
        ON d.owner_type = ? AND d.owner_id = p.id
     WHERE (p.id = ? OR p.slug = ?)
       AND ${siteId ? 'p.site_id = ?' : 'p.site_id IS NULL'}
     LIMIT 2
  `, siteId
    ? [blogContentOwnerType(siteId), postIdOrSlug, postIdOrSlug, siteId]
    : [blogContentOwnerType(siteId), postIdOrSlug, postIdOrSlug])
  if (rows.length === 0) notFound('Post not found')
  if (rows.length > 1) badRequest('Ambiguous platform content identifier; use the row id.')
  const source = rows[0]!
  if (source.status !== 'scheduled') badRequest('Only a scheduled article can be published or rescheduled')
  if (source.updated_at !== input.expected_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
  }
  if (!source.document_id || !source.document_updated_at) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  }
  if (source.document_updated_at !== input.expected_document_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
  }

  const sourceTimestamp = Date.parse(source.updated_at)
  const documentTimestamp = Date.parse(source.document_updated_at)
  const committedAt = new Date(Math.max(
    Date.now(),
    Number.isFinite(sourceTimestamp) ? sourceTimestamp + 1 : 0,
    Number.isFinite(documentTimestamp) ? documentTimestamp + 1 : 0,
  )).toISOString()
  const rowParams: ApiValue[] = []
  let rowAssignments: string
  if (scheduledFor) {
    rowAssignments = `scheduled_for = ?,
      published_at = NULL,
      status = 'scheduled',
      updated_at = ?`
    rowParams.push(scheduledFor, committedAt)
  } else {
    rowAssignments = `scheduled_for = NULL,
      published_at = ?,
      first_published_at = COALESCE(first_published_at, ?),
      status = 'published',
      updated_at = ?`
    rowParams.push(committedAt, committedAt, committedAt)
  }

  const queries: BatchQuery[] = [
    {
      query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
        SELECT ?, ?, NULL, '__blog_lifecycle_concurrency_guard__', 0, NULL, '{}', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM blog_posts WHERE id = ? AND updated_at = ?)
            OR NOT EXISTS (
              SELECT 1 FROM content_documents
               WHERE id = ? AND updated_at = ?
            )`,
      params: [
        crypto.randomUUID(),
        source.document_id,
        committedAt,
        committedAt,
        source.id,
        input.expected_updated_at,
        source.document_id,
        input.expected_document_updated_at,
      ],
    },
    {
      query: `UPDATE blog_posts SET ${rowAssignments} WHERE id = ? AND updated_at = ?`,
      params: [...rowParams, source.id, input.expected_updated_at],
    },
  ]
  try {
    await executeBatch(db, queries)
  } catch (error) {
    const latest = await queryFirst<{ updated_at: string; document_updated_at: string | null;  } | null>(db, `
      SELECT p.updated_at, d.updated_at AS document_updated_at
        FROM blog_posts p
        LEFT JOIN content_documents d ON d.id = ?
       WHERE p.id = ? LIMIT 1
    `, [source.document_id, source.id])
    if (!latest) notFound('Post not found')
    if (latest.updated_at !== input.expected_updated_at) {
      throw new HTTPError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
    }
    if (latest.document_updated_at !== input.expected_document_updated_at ) {
      throw new HTTPError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
    }
    throw error
  }

  return {
    id: source.id,
    status: scheduledFor ? 'scheduled' : 'published',
    published_at: scheduledFor ? null : committedAt,
    scheduled_for: scheduledFor,
    updated_at: committedAt,
    content_document_updated_at: source.document_updated_at,
  }
}

export async function updatePlatformBlogPost(
  db: D1Database,
  postIdOrSlug: string,
  input: PlatformBlogUpdateInput,
  siteId: string | null = null,
  env?: CloudflareEnv,
) {
  rejectLegacyBlogContentFields(input)
  rejectBlogUpdateLifecycleFields(input)
  if (!BLOG_UPDATE_MUTATION_FIELDS.some(field => input[field] !== undefined)) {
    badRequest('At least one blog mutation field is required')
  }
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const isTenant = Boolean(siteId)
  validateBlogCommon(input, isTenant)
  const current = await queryFirst<{ organization_id: string | null; category: string | null; title: string; slug: string; published_at: string | null; first_published_at: string | null; slug_manually_overridden: number; updated_at: string }>(db, 'SELECT organization_id, category, title, slug, published_at, first_published_at, slug_manually_overridden, updated_at FROM blog_posts WHERE id = ? LIMIT 1', [postId])
  if (!current) notFound('Post not found')
  if (input.expected_updated_at && current.updated_at !== input.expected_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
  }
  let normalizedBlocks: Array<ContentBlockInput & { id?: string }> | null = null
  let contentDocument: Awaited<ReturnType<typeof getContentEditorSnapshot>> = null
  if (input.content_blocks !== undefined) {
    if (!input.expected_document_updated_at) badRequest('expected_document_updated_at is required with content_blocks')
    contentDocument = await getContentEditorSnapshot(db, blogContentOwnerType(siteId), postId)
    if (!contentDocument || contentDocument.document.updated_at !== input.expected_document_updated_at) {
      throw new HTTPError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
    }
    normalizedBlocks = await normalizeEditorContentBlocks(db, input.content_blocks, siteId)
  }
  const effectiveCategory = input.category !== undefined ? input.category : current?.category ?? null
  if (!isTenant) {
    if (!effectiveCategory?.trim()) badRequest('category is required')
    assertValidBlogCategory(effectiveCategory)
  }
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [now]

  if (input.visibility !== undefined && !['public', 'unlisted'].includes(input.visibility)) badRequest('visibility must be public or unlisted')
  if (input.title !== undefined) {
    if (!input.title?.trim()) badRequest('title cannot be blank')
    // Published URLs are durable identifiers. A headline edit must not silently
    // move the article and break inbound links, feeds, search, or tenant schema.
    updates.push('title = ?')
    params.push(input.title)
    if (!current?.first_published_at && !current?.slug_manually_overridden && input.slug === undefined) {
      updates.push('slug = ?')
      params.push(normalizeBlogSlug(input.title))
    }
  }

  if (input.reset_slug_override && input.slug !== undefined && input.slug !== null) badRequest('reset_slug_override cannot be combined with a manual slug')
  const slugMutation = resolveSlugMutation({
    requestedSlug: input.reset_slug_override ? null : input.slug,
    title: input.title ?? current?.title ?? '',
    currentSlug: current?.slug ?? '',
    manuallyOverridden: Boolean(current?.slug_manually_overridden),
  })
  const requestedSlug = input.slug !== undefined || input.reset_slug_override ? slugMutation.slug : null
  if (requestedSlug && requestedSlug !== current?.slug) {
    const postCollision = await queryFirst<{ id: string } | null>(db, `
      SELECT id FROM blog_posts
       WHERE slug = ? AND id != ? AND ${siteId ? 'site_id = ?' : 'site_id IS NULL'} LIMIT 1
    `, siteId ? [requestedSlug, postId, siteId] : [requestedSlug, postId])
    if (postCollision) badRequest('Slug already in use')
    const redirectCollision = await queryFirst<{ id: string } | null>(db, `
      SELECT id FROM blog_post_redirects
       WHERE old_slug = ? AND ${siteId ? 'site_id = ?' : 'site_id IS NULL'} LIMIT 1
    `, siteId ? [requestedSlug, siteId] : [requestedSlug])
    if (redirectCollision) badRequest('Slug collides with redirect history')
    updates.push('slug = ?', 'slug_manually_overridden = ?')
    params.push(requestedSlug, slugMutation.manuallyOverridden ? 1 : 0)
  } else if (input.reset_slug_override) {
    updates.push('slug_manually_overridden = 0')
  }

  const featuredId = featuredAssetId(input)
  if (featuredId) {
    await ensureRenderableMediaAssetExists(db, featuredId, 'media', siteId)
  }
  const fields: Array<keyof Omit<PlatformBlogUpdateInput,
    | 'title'
    | 'hide_from_nav'
    | 'slug'
    | 'redirect_old_slug'
    | 'reset_slug_override'
    | 'content_blocks'
    | 'expected_document_updated_at'
    | 'expected_updated_at'
  >> = [
    'excerpt',
    'category',
    'nav_section',
    'nav_title',
    'nav_order',
    'nav_section_order',
    'featured_order',
    'seo_title',
    'seo_description',
    'seo_keywords',
    'canonical_url',
    'robots',
    'visibility',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`)
      params.push(input[field] as ApiValue)
    }
  }
  if (input.tags !== undefined) {
    updates.push('tags_json = ?')
    params.push(input.tags ? JSON.stringify(input.tags) : null)
  }
  if (input.hide_from_nav !== undefined) {
    updates.push('hide_from_nav = ?')
    params.push(normalizeHideFromNav(input.hide_from_nav) ?? 0)
  }

  params.push(postId)
  if (input.expected_updated_at) params.push(input.expected_updated_at)

  let blogMutationApplied = false
  try {
    const rowUpdate = {
      query: `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ?${input.expected_updated_at ? ' AND updated_at = ?' : ''}`,
      params,
    }
    if (normalizedBlocks && contentDocument) {
      const before = input.expected_updated_at ? [{
        query: 'INSERT INTO blog_posts SELECT * FROM blog_posts WHERE id = ? AND updated_at != ?',
        params: [postId, input.expected_updated_at],
      }, rowUpdate] : [rowUpdate]
      const placementScope = await mediaPlacementScope(db, siteId, current.organization_id)
      await replaceContentDocumentBlocks(db, blogContentOwnerType(siteId), postId, normalizedBlocks, {
        expected_document_updated_at: input.expected_document_updated_at ?? contentDocument.document.updated_at,
        additionalQueriesBefore: before,
        additionalQueriesAfter: contentBlockPlacementQueries(normalizedBlocks as NormalizedEditorBlock[], placementScope, now),
      })
    } else {
      const post = await queryFirst<ApiRecord | null>(db, `${rowUpdate.query} RETURNING id`, rowUpdate.params)
      if (!post && input.expected_updated_at) throw new HTTPError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
      if (!post) notFound('Post not found')
    }
    blogMutationApplied = true

    if (featuredId !== undefined) {
      const placementScope = await mediaPlacementScope(db, siteId, current.organization_id)
      await executeBatch(db, buildReplaceMediaPlacementQueries({ organizationId: placementScope.organizationId, siteId: placementScope.siteId, placement: { owner_type: 'blog_post', owner_id: postId, slot: 'featured' }, media: featuredId ? [{ asset_id: featuredId }] : [] }))
    }

    if (requestedSlug && requestedSlug !== current?.slug && current?.first_published_at && input.redirect_old_slug !== false) {
      await createBlogRedirect(db, postId, siteId, current.slug)
    }

    const updatedPost = await getPlatformBlogPost(db, postId, siteId, env)
    return {
      success: true,
      admin_edit_url: updatedPost.admin_edit_url,
      edit_url: updatedPost.edit_url,
      public_path: updatedPost.public_path,
      public_url: updatedPost.public_url,
      preview_url: updatedPost.preview_url,
      post: updatedPost,
    }
  } catch (err) {
    if (!blogMutationApplied && input.expected_updated_at) {
      const latest = await queryFirst<{ updated_at: string } | null>(db, 'SELECT updated_at FROM blog_posts WHERE id = ? LIMIT 1', [postId])
      if (latest && latest.updated_at !== input.expected_updated_at) {
        throw new HTTPError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
      }
    }
    if (isUniqueConstraintError(err, 'blog_posts')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformBlogPost(db: D1Database, postIdOrSlug: string, siteId: string | null = null) {
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const ownerType = blogContentOwnerType(siteId)
  await executeBatch(db, [
    { query: "DELETE FROM media_placements WHERE owner_type = 'blog_post' AND owner_id = ?", params: [postId] },
    // The content_documents delete below cascades to content_blocks (FK ON DELETE
    // CASCADE), but media_placements for those blocks (owner_type = 'content_block')
    // has no owner FK, so it must be cleared explicitly while the blocks still exist.
    {
      query: `
        DELETE FROM media_placements
        WHERE owner_type = 'content_block' AND owner_id IN (
          SELECT id FROM content_blocks WHERE document_id IN (
            SELECT id FROM content_documents WHERE owner_type = ? AND owner_id = ?
          )
        )
      `,
      params: [ownerType, postId],
    },
    { query: 'DELETE FROM content_documents WHERE owner_type = ? AND owner_id = ?', params: [ownerType, postId] },
    { query: 'DELETE FROM blog_posts WHERE id = ?', params: [postId] },
  ])
  return { success: true }
}

export async function reorderPlatformBlogPosts(
  db: D1Database,
  items: Array<{
    post_id: string
    nav_section?: string | null
    nav_title?: string | null
    nav_order: number
    nav_section_order?: number | null
    hide_from_nav?: boolean | number | null
  }>,
  siteId: string | null = null,
  env?: CloudflareEnv,
) {
  if (!items.length) badRequest('items are required')
  const now = new Date().toISOString()
  const queries: { query: string; params: unknown[] }[] = []
  const scopeClause = siteId ? 'site_id = ?' : 'site_id IS NULL'

  for (const item of items) {
    const metadata: Partial<PlatformContentNavInput> = { nav_order: item.nav_order }
    if (hasOwnField(item, 'nav_section')) metadata.nav_section = item.nav_section ?? null
    if (hasOwnField(item, 'nav_title')) metadata.nav_title = item.nav_title ?? null
    if (hasOwnField(item, 'nav_section_order')) metadata.nav_section_order = item.nav_section_order ?? null
    validateNavMetadata(metadata)
    const postId = await resolvePlatformContentId(db, 'blog_posts', item.post_id, 'Post not found', siteId)
    const updates = ['nav_order = ?', 'updated_at = ?']
    const params: ApiValue[] = [Number(item.nav_order), now]
    if (hasOwnField(item, 'nav_section')) {
      updates.splice(1, 0, 'nav_section = ?')
      params.splice(1, 0, item.nav_section ?? null)
    }
    if (hasOwnField(item, 'nav_title')) {
      updates.splice(updates.length - 1, 0, 'nav_title = ?')
      params.splice(params.length - 1, 0, item.nav_title ?? null)
    }
    if (hasOwnField(item, 'nav_section_order')) {
      updates.splice(updates.length - 1, 0, 'nav_section_order = ?')
      params.splice(params.length - 1, 0, item.nav_section_order != null ? Number(item.nav_section_order) : null)
    }
    if (hasOwnField(item, 'hide_from_nav')) {
      updates.splice(updates.length - 1, 0, 'hide_from_nav = ?')
      params.splice(params.length - 1, 0, normalizeHideFromNav(item.hide_from_nav) ?? 0)
    }
    params.push(postId)
    if (siteId) params.push(siteId)
    queries.push({
      query: `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ? AND ${scopeClause}`,
      params,
    })
  }

  await executeBatch(db, queries)
  return { success: true, posts: await listPlatformBlogPosts(db, null, siteId, env) }
}

export async function listPlatformDocs(db: DbClient, _status?: string | null) {
  const sql = `SELECT
      d.id, d.title, d.slug, d.excerpt, d.category, d.seo_description, d.seo_keywords, d.canonical_url, d.robots,
      d.nav_section, d.nav_title, d.nav_order, d.nav_section_order, d.nav_group, d.nav_group_order, d.hide_from_nav, d.featured_order,
      mp.asset_id AS asset_id, ma.public_url AS media_public_url, ma.thumbnail_url AS media_thumbnail_url, ma.kind AS media_kind,
      ma.width AS media_width, ma.height AS media_height,
      d.difficulty_level, d.sort_order, d.created_at, d.updated_at
    FROM platform_docs d
    LEFT JOIN media_placements mp ON mp.owner_type = 'platform_doc' AND mp.owner_id = d.id AND mp.slot = 'featured' AND mp.sort_order = 0
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
    ORDER BY COALESCE(d.featured_order, 999999), COALESCE(d.nav_section_order, 999999), COALESCE(d.nav_section, d.category), COALESCE(d.nav_group_order, 999999), COALESCE(d.nav_group, ''), COALESCE(d.nav_order, d.sort_order, 999999), d.created_at DESC`
  const results = await queryAll<ApiRecord>(db, sql)
  return (results ?? []).map(record => platformDocReviewUrls(attachFeaturedMedia(attachPublished(record, true))))
}

export async function getPlatformDoc(db: DbClient, docIdOrSlug: string) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  const doc = await queryFirst<ApiRecord | null>(
    db,
    `SELECT
       d.id, d.title, d.slug, d.excerpt, d.category, d.seo_description, d.seo_keywords, d.canonical_url, d.robots,
       d.nav_section, d.nav_title, d.nav_order, d.nav_section_order, d.nav_group, d.nav_group_order, d.hide_from_nav, d.featured_order,
       d.difficulty_level, d.sort_order,
       mp.asset_id AS asset_id, ma.public_url AS media_public_url, ma.thumbnail_url AS media_thumbnail_url, ma.kind AS media_kind,
       ma.width AS media_width, ma.height AS media_height,
       d.created_at, d.updated_at
     FROM platform_docs d
     LEFT JOIN media_placements mp ON mp.owner_type = 'platform_doc' AND mp.owner_id = d.id AND mp.slot = 'featured' AND mp.sort_order = 0
     LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
     WHERE d.id = ?`,
    [docId],
  )
  if (!doc) notFound('Doc not found')
  const contentDocument = await getContentEditorSnapshot(db, 'platform_doc', docId)
  if (!contentDocument) throw new HTTPError({ statusCode: 500, statusMessage: 'Documentation content document is missing' })
  return {
    ...platformDocReviewUrls(attachFeaturedMedia(attachPublished(doc, true))),
    content_blocks: contentDocument.blocks,
    document_updated_at: contentDocument.document.updated_at,
  }
}

export async function createPlatformDoc(
  db: D1Database,
  authorId: string,
  input: PlatformDocCreateInput,
) {
  if (!input.title || !input.content_blocks?.length) badRequest('title and content_blocks are required')
  validateDocCommon(input)
  const normalizedBlocks = await normalizeEditorContentBlocks(db, input.content_blocks, null)
  const canonicalBody = renderCanonicalBlogBody(normalizedBlocks)
  const featuredId = featuredAssetId(input)
  if (featuredId) await ensureRenderableMediaAssetExists(db, featuredId, 'media')

  const id = crypto.randomUUID()
  const slugBase = normalizeSlugFromTitle(input.title, 'doc')
  const now = new Date().toISOString()
  const placementScope = await mediaPlacementScope(db, null, null)

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      const docInsert: BatchQuery = { query: `
        INSERT INTO platform_docs (id, title, slug, excerpt, category, nav_section, nav_title, nav_order, nav_section_order, nav_group, nav_group_order, hide_from_nav, featured_order, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, params: [
        id,
        input.title,
        slug,
        input.excerpt ?? null,
        input.category ?? null,
        input.nav_section ?? null,
        input.nav_title ?? null,
        input.nav_order != null ? Number(input.nav_order) : null,
        input.nav_section_order != null ? Number(input.nav_section_order) : null,
        input.nav_group ?? null,
        input.nav_group_order != null ? Number(input.nav_group_order) : null,
        normalizeHideFromNav(input.hide_from_nav) ?? 0,
        input.featured_order != null ? Number(input.featured_order) : null,
        authorId,
        input.seo_description ?? null,
        input.seo_keywords ?? null,
        input.canonical_url ?? null,
        input.robots ?? null,
        input.difficulty_level ?? null,
        input.sort_order ?? 0,
        now,
        now,
      ] }
      await createContentDocumentWithBlocks(db, 'platform_doc', id, normalizedBlocks, {
        bodyMarkdown: canonicalBody,
        additionalQueriesBefore: [docInsert],
        additionalQueriesAfter: [
          ...buildReplaceMediaPlacementQueries({ organizationId: placementScope.organizationId, siteId: placementScope.siteId, placement: { owner_type: 'platform_doc', owner_id: id, slot: 'featured' }, media: featuredId ? [{ asset_id: featuredId }] : [], now }),
          ...contentBlockPlacementQueries(normalizedBlocks, placementScope, now),
        ],
      })

      const doc = await getPlatformDoc(db, id)
      return {
        success: true,
        id,
        slug,
        admin_edit_url: doc.admin_edit_url,
        public_path: doc.public_path,
        public_url: doc.public_url,
        doc,
      }
    } catch (err) {
      if (isUniqueConstraintError(err, 'platform_docs') && attempt < MAX_SLUG_ATTEMPTS - 1) continue
      throw err
    }
  }
  throw new HTTPError({ statusCode: 500, statusMessage: 'Failed to create doc' })
}

export async function updatePlatformDoc(
  db: D1Database,
  docIdOrSlug: string,
  input: PlatformDocUpdateInput,
) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  validateDocCommon(input)
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [now]

  if (input.title !== undefined) {
    if (!input.title?.trim()) badRequest('title cannot be blank')
    const slug = normalizeSlugFromTitle(input.title, 'doc')
    const existing = await queryFirst(db, 'SELECT id FROM platform_docs WHERE slug = ? AND id != ? LIMIT 1', [slug, docId])
    if (existing) badRequest('Slug already in use')
    updates.push('title = ?', 'slug = ?')
    params.push(input.title, slug)
  }

  const featuredId = featuredAssetId(input)
  if (featuredId) {
    await ensureRenderableMediaAssetExists(db, featuredId, 'media')
  }

  const fields: Array<keyof PlatformDocUpdateInput> = [
    'excerpt',
    'category',
    'nav_section',
    'nav_title',
    'nav_order',
    'nav_section_order',
    'nav_group',
    'nav_group_order',
    'featured_order',
    'seo_description',
    'seo_keywords',
    'canonical_url',
    'robots',
    'difficulty_level',
    'sort_order',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`)
      params.push(input[field] as ApiValue)
    }
  }
  if (input.hide_from_nav !== undefined) {
    updates.push('hide_from_nav = ?')
    params.push(normalizeHideFromNav(input.hide_from_nav) ?? 0)
  }

  const normalizedBlocks = input.content_blocks === undefined
    ? null
    : await normalizeEditorContentBlocks(db, input.content_blocks, null)
  if (normalizedBlocks) {
    if (!normalizedBlocks.length) badRequest('content_blocks cannot be empty')
    if (!input.expected_document_updated_at) badRequest('expected_document_updated_at is required with content_blocks')
  }

  const rowUpdate: BatchQuery = {
    query: `UPDATE platform_docs SET ${updates.join(', ')} WHERE id = ?`,
    params: [...params, docId],
  }
  const mutationQueries: BatchQuery[] = [rowUpdate]
  const placementScope = featuredId !== undefined || normalizedBlocks
    ? await mediaPlacementScope(db, null, null)
    : null
  if (featuredId !== undefined && placementScope) {
    mutationQueries.push(...buildReplaceMediaPlacementQueries({ organizationId: placementScope.organizationId, siteId: placementScope.siteId, placement: { owner_type: 'platform_doc', owner_id: docId, slot: 'featured' }, media: featuredId ? [{ asset_id: featuredId }] : [], now }))
  }
  try {
    if (normalizedBlocks && placementScope) {
      await replaceContentDocumentBlocks(db, 'platform_doc', docId, normalizedBlocks, {
        expected_document_updated_at: input.expected_document_updated_at!,
        additionalQueriesBefore: [rowUpdate],
        additionalQueriesAfter: [
          ...mutationQueries.slice(1),
          ...contentBlockPlacementQueries(normalizedBlocks, placementScope, now),
        ],
      })
    } else {
      await executeBatch(db, mutationQueries)
    }

    const updatedDoc = await getPlatformDoc(db, docId)
    return {
      success: true,
      admin_edit_url: updatedDoc.admin_edit_url,
      public_path: updatedDoc.public_path,
      public_url: updatedDoc.public_url,
      doc: updatedDoc,
    }
  } catch (err) {
    if (isUniqueConstraintError(err, 'platform_docs')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformDoc(db: D1Database, docIdOrSlug: string) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  await executeBatch(db, [
    { query: "DELETE FROM media_placements WHERE owner_type = 'platform_doc' AND owner_id = ?", params: [docId] },
    // The content_documents delete below cascades to content_blocks (FK ON DELETE
    // CASCADE), but media_placements for those blocks (owner_type = 'content_block')
    // has no owner FK, so it must be cleared explicitly while the blocks still exist.
    {
      query: `
        DELETE FROM media_placements
        WHERE owner_type = 'content_block' AND owner_id IN (
          SELECT id FROM content_blocks WHERE document_id IN (
            SELECT id FROM content_documents WHERE owner_type = 'platform_doc' AND owner_id = ?
          )
        )
      `,
      params: [docId],
    },
    { query: "DELETE FROM content_documents WHERE owner_type = 'platform_doc' AND owner_id = ?", params: [docId] },
    { query: 'DELETE FROM platform_docs WHERE id = ?', params: [docId] },
  ])
  return { success: true }
}

export async function reorderPlatformDocs(
  db: D1Database,
  items: Array<{
    doc_id: string
    nav_section?: string | null
    nav_title?: string | null
    nav_order: number
    nav_section_order?: number | null
    nav_group?: string | null
    nav_group_order?: number | null
    hide_from_nav?: boolean | number | null
  }>,
) {
  if (!items.length) badRequest('items are required')
  const now = new Date().toISOString()
  const queries: { query: string; params: unknown[] }[] = []

  for (const item of items) {
    const metadata: Partial<PlatformContentNavInput> = { nav_order: item.nav_order }
    if (hasOwnField(item, 'nav_section')) metadata.nav_section = item.nav_section ?? null
    if (hasOwnField(item, 'nav_title')) metadata.nav_title = item.nav_title ?? null
    if (hasOwnField(item, 'nav_section_order')) metadata.nav_section_order = item.nav_section_order ?? null
    validateNavMetadata(metadata)
    validateDocNavGroupMetadata({
      nav_group: hasOwnField(item, 'nav_group') ? item.nav_group ?? null : undefined,
      nav_group_order: hasOwnField(item, 'nav_group_order') ? item.nav_group_order ?? null : undefined,
    })
    const docId = await resolvePlatformContentId(db, 'platform_docs', item.doc_id, 'Doc not found')
    const updates = ['nav_order = ?', 'updated_at = ?']
    const params: ApiValue[] = [Number(item.nav_order), now]
    if (hasOwnField(item, 'nav_section')) {
      updates.splice(1, 0, 'nav_section = ?')
      params.splice(1, 0, item.nav_section ?? null)
    }
    if (hasOwnField(item, 'nav_title')) {
      updates.splice(updates.length - 1, 0, 'nav_title = ?')
      params.splice(params.length - 1, 0, item.nav_title ?? null)
    }
    if (hasOwnField(item, 'nav_section_order')) {
      updates.splice(updates.length - 1, 0, 'nav_section_order = ?')
      params.splice(params.length - 1, 0, item.nav_section_order != null ? Number(item.nav_section_order) : null)
    }
    if (hasOwnField(item, 'nav_group')) {
      updates.splice(updates.length - 1, 0, 'nav_group = ?')
      params.splice(params.length - 1, 0, item.nav_group ?? null)
    }
    if (hasOwnField(item, 'nav_group_order')) {
      updates.splice(updates.length - 1, 0, 'nav_group_order = ?')
      params.splice(params.length - 1, 0, item.nav_group_order != null ? Number(item.nav_group_order) : null)
    }
    if (hasOwnField(item, 'hide_from_nav')) {
      updates.splice(updates.length - 1, 0, 'hide_from_nav = ?')
      params.splice(params.length - 1, 0, normalizeHideFromNav(item.hide_from_nav) ?? 0)
    }
    params.push(docId)
    queries.push({
      query: `UPDATE platform_docs SET ${updates.join(', ')} WHERE id = ?`,
      params,
    })
  }

  await executeBatch(db, queries)
  return { success: true, docs: await listPlatformDocs(db) }
}
