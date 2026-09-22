import { HTTPError } from 'nitro';

import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import {
  attachContentBlockMedia,
  createContentDocumentWithBlocks,
  formatBlockOutline,
  prepareContentDocumentDeletion,
  getContentBlocksForDocument,
  getContentOutline,
  getContentDocumentById,
  listBlocksForDocument,
  updateContentDocument,
  type ContentDocumentChanges,
  renderContentBlocksToMarkdown,
  type ContentBlockInput,
  type ContentDocumentRow,
} from '~/server/utils/content/documents'
import {
  loadExactPublicLocalizations,
  projectLocalizedMediaAlt,
} from '~/server/utils/public-localization'
import { listPublicLocaleRepresentations } from '~/server/utils/public-locale-representations'
import { normalizeVertical } from '~/utils/vertical-copy'
import { slugifyTitle } from '~/utils/post-slugs'
import { getPlatformSite } from '~/server/utils/platform-site'
import { ARTICLE_COLLECTION_SLUGS, isArticleCollection, type ArticleCollection } from '~/utils/article-collections'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { normalizeBlogSlug, parseScheduledFor, resolveSlugMutation } from '~/utils/blog-editor'
import { createBlogRedirect } from '~/server/utils/blog-publishing'
import { PLATFORM_TEMPLATE, resolvePublicTemplate } from '~/utils/template-registry'
import { buildSingleMediaPlacementQueries, hydrateMediaPlacementRefs, insertInitialMediaPlacements } from '~/server/utils/media-asset-manager'
import { COVER_SELECT, attachCoverMedia, coverJoinSql } from '~/server/utils/content/cover'
import { attachPageQa } from '~/server/utils/location-qa'
import { isSingleMediaPlacement } from '~/shared/media-placement-contract'
import { parseRobotsIntent, ROBOTS_INTENTS } from '~/shared/robots-directive'
import { getMediaPlacements } from '~/server/utils/media-placement'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { findAuthUsersByIds, type CloudflareEnv } from '~/server/utils/auth'
import { findOrganizationById } from '~/server/utils/member-access'
import { refreshSocialCard } from '~/server/utils/social-card'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'
import { createPreviewToken, PREVIEW_TOKEN_QUERY, PREVIEW_TOKEN_TTL_MS } from '~/server/utils/preview-token'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'

const BLOG_TITLE_MAX = 200
const BLOG_EXCERPT_MAX = 500
const BLOG_CATEGORY_MAX = 100
const BLOG_SEO_TITLE_MAX = 200
const BLOG_SEO_DESCRIPTION_MAX = 500
const BLOG_SEO_KEYWORDS_MAX = 500
const MAX_SLUG_ATTEMPTS = 8
const BLOG_UPDATE_MUTATION_FIELDS: Array<keyof PlatformBlogUpdateInput> = [
  'title',
  'excerpt',
  'collection',
  'category',
  'tags',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'canonical_url',
  'robots',
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




export interface BlogScope {
  organization_id?: string | null
}

export interface PlatformBlogCreateInput {
  status?: PlatformBlogLifecycleState['status']
  title: string
  slug?: string | null
  content_blocks: Array<ContentBlockInput & { id?: string }>
  excerpt?: string | null
  /** Platform template only: which collection the article belongs to. Defaults to the blog. */
  collection?: ArticleCollection | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  visibility?: 'public' | 'unlisted'
  scheduled_for?: string | null
}

export interface PlatformBlogUpdateInput {
  title?: string
  excerpt?: string | null
  collection?: ArticleCollection | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  visibility?: 'public' | 'unlisted'
  slug?: string | null
  redirect_old_slug?: boolean
  reset_slug_override?: boolean
  content_blocks?: Array<ContentBlockInput & { id?: string }>
  expected_updated_at?: string
}

export interface PlatformBlogLifecycleInput {
  expected_updated_at: string
  scheduled_for?: string | null
}

export interface PlatformBlogLifecycleState {
  id: string
  status: 'draft' | 'published' | 'scheduled'
  published_at: string | null
  scheduled_for: string | null
  updated_at: string
}

export function parseBlogLifecycleInput(body: unknown, _action: 'publish' = 'publish'): PlatformBlogLifecycleInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) badRequest('Request body must be a valid object')
  const record = body as Record<string, unknown>
  const allowed = new Set(['expected_updated_at', 'scheduled_for'])
  const unknownField = Object.keys(record).find(key => !allowed.has(key))
  if (unknownField) badRequest(`Unknown request field: ${unknownField}`)
  if (typeof record.expected_updated_at !== 'string' || !record.expected_updated_at.trim()) badRequest('expected_updated_at is required')
  if (record.scheduled_for !== undefined && record.scheduled_for !== null && typeof record.scheduled_for !== 'string') {
    badRequest('scheduled_for must be a string or null')
  }
  return {
    expected_updated_at: record.expected_updated_at,
    scheduled_for: record.scheduled_for as string | null | undefined,
  }
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
  kind: 'article',
  identifier: string,
  notFoundMessage: string,
  organizationId: string,
): Promise<string> {
  const byId = await queryFirst<{ id: string }>(db, `SELECT id FROM content_documents WHERE kind = ? AND row_role = 'root' AND organization_id = ? AND id = ? LIMIT 1`, [kind, organizationId, identifier])
  const bySlug = await queryFirst<{ id: string }>(db, `SELECT id FROM content_documents WHERE kind = ? AND row_role = 'root' AND organization_id = ? AND slug = ? LIMIT 1`, [kind, organizationId, identifier])
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

function normalizeSlugFromTitle(title: string, fallbackPrefix: 'post') {
  const slug = slugifyTitle(title)
  return slug || `${fallbackPrefix}-${Date.now()}`
}

function isUniqueConstraintError(err: unknown) {
  const message = String((err as ApiValue)?.message || err || '')
  const normalized = message.replace(/["'`]/g, '')
  return normalized.includes('content_documents.slug') && normalized.includes('content_documents.locale')
}

function assertStringLength(value: string | null | undefined, max: number, field: string) {
  if (value != null && value.length > max) {
    badRequest(`${field} exceeds maximum length (${max})`)
  }
}

/** Canonicalizes the submitted intent in place; an unsupported value is a bad request. */
function normalizeRobotsField(input: { robots?: string | null }) {
  if (input.robots === undefined) return
  const parsed = parseRobotsIntent(input.robots)
  if (!parsed.ok) badRequest(`robots must be one of: ${ROBOTS_INTENTS.join(', ')}`)
  input.robots = parsed.intent
}

function articleCollectionOf(value: unknown): ArticleCollection {
  if (value === undefined || value === null) return 'blog'
  if (!isArticleCollection(value)) badRequest(`collection must be one of: ${ARTICLE_COLLECTION_SLUGS.join(', ')}`)
  return value
}

function assertValidCanonicalUrl(value: string | null | undefined) {
  if (value == null || value === '') return
  try {
    if (value.startsWith('/') && !/^\/[\\/]/.test(value)) {
      const origin = 'https://canonical.invalid'
      if (new URL(value, origin).origin !== origin) badRequest('canonical_url must be an absolute URL or a site-root path')
    } else {
      void new URL(value)
    }
  } catch {
    badRequest('canonical_url must be an absolute URL or a site-root path')
  }
}

/** The tenant's template and identity, which decide article URLs and editor chrome. */
export async function loadSiteTemplate(db: DbClient, organizationId: string) {
  const site = await queryFirst<{ organization_id: string; theme_id: string | null; vertical: string | null; name: string; brand_color: string | null }>(db, `
    SELECT o.id AS organization_id, o.theme_id, o.vertical, o.name,
           json_extract(o.settings_json, '$.config.brand_color') AS brand_color
      FROM organization o
     WHERE o.id = ? LIMIT 1
  `, [organizationId])
  if (!site) notFound('Organization not found')
  const template = resolvePublicTemplate({ themeId: site.theme_id, vertical: site.vertical })
  return { ...site, template, isPlatform: template.slug === 'platform' }
}

type NormalizedEditorBlock = ContentBlockInput & { id: string; placement_media: Array<{ asset_id: string; slot: string }> }

async function normalizeEditorContentBlocks(
  db: D1Database,
  blocks: Array<ContentBlockInput & { id?: string }>,
  scope: { organizationId: string },
): Promise<NormalizedEditorBlock[]> {
  return await Promise.all(blocks.map(async (block): Promise<NormalizedEditorBlock> => {
    if (!block || typeof block !== 'object' || !block.data || typeof block.data !== 'object' || Array.isArray(block.data)) badRequest('Every content block requires an object data payload')
    if (block.type === 'heading' && (typeof block.data.text !== 'string' || !block.data.text.trim())) badRequest('Heading blocks require non-empty data.text')
    const id = block.id ?? crypto.randomUUID()
    const media = Array.isArray(block.media) ? block.media : []
    if (block.type === 'image' && media.length > 1) badRequest('Image blocks accept one media asset')
    const placementMedia = media.map((item, index) => {
      const assetId = typeof item?.asset_id === 'string' ? item.asset_id.trim() : ''
      if (!assetId) badRequest(`content_blocks media[${index}].asset_id is required`)
      return { asset_id: assetId, slot: typeof item.slot === 'string' && item.slot.trim() ? item.slot.trim() : block.type === 'gallery' ? 'gallery' : 'media' }
    })
    await hydrateMediaPlacementRefs(db, {
      ...scope,
      refs: placementMedia,
      allowedKinds: ['image', 'video'],
      fieldName: `content_blocks.${id}.media`,
    })
    // An image block with no image is nothing: it used to be written anyway,
    // and a post that took fifteen such blocks came back fifteen times from
    // the cover join.
    if (block.type === 'image' && !placementMedia.length) badRequest('Image blocks require one media asset')
    return { ...block, id, data: { ...block.data }, media: placementMedia, placement_media: placementMedia }
  }))
}

async function contentBlockPlacementQueries(
  db: DbClient,
  blocks: NormalizedEditorBlock[],
  scope: { organizationId: string },
  now?: string,
) {
  if (!blocks.length) return []
  const existingRows = await queryAll<{ id: string }>(db, `
    SELECT id FROM content_blocks WHERE id IN (SELECT value FROM json_each(?))
  `, [d1JsonStringSet(blocks.map(block => block.id))])
  const existingIds = new Set(existingRows.map(row => row.id))
  const existingPlacements = await getMediaPlacements(db, {
    organizationId: scope.organizationId,
    ownerType: 'content_block',
    ownerIds: blocks.map(block => block.id),
  })
  const queries: BatchQuery[] = []
  for (const block of blocks) {
    const bySlot = new Map<string, Array<{ asset_id: string }>>()
    for (const item of block.placement_media) {
      const items = bySlot.get(item.slot) ?? []
      items.push({ asset_id: item.asset_id })
      bySlot.set(item.slot, items)
    }
    if (existingIds.has(block.id)) {
      const currentBySlot = new Map<string, string[]>()
      for (const item of existingPlacements.get(block.id) ?? []) {
        const ids = currentBySlot.get(item.slot) ?? []
        ids.push(item.asset_id)
        currentBySlot.set(item.slot, ids)
      }
      for (const slot of new Set([...currentBySlot.keys(), ...bySlot.keys()])) {
        const current = currentBySlot.get(slot) ?? []
        const requested = (bySlot.get(slot) ?? []).map(item => item.asset_id)
        if (current.length === requested.length && current.every((assetId, index) => assetId === requested[index])) continue
        if (!isSingleMediaPlacement({ owner_type: 'content_block', slot })) {
          badRequest(`content_blocks.${block.id}.media cannot replace an existing gallery; use attach/remove/reorder media operations`)
        }
        queries.push(...buildSingleMediaPlacementQueries({
          ...scope,
          placement: { owner_type: 'content_block', owner_id: block.id, slot },
          media: bySlot.get(slot) ?? [],
          now,
        }))
      }
      continue
    }
    queries.push(...[...bySlot.keys()].flatMap(slot => insertInitialMediaPlacements({
        ...scope,
        placement: { owner_type: 'content_block', owner_id: block.id, slot },
        media: bySlot.get(slot) ?? [],
        now,
      })))
  }
  return queries
}

export async function prepareTenantBlogContentBlocks(
  db: D1Database,
  blocks: Array<ContentBlockInput & { id?: string }>,
  organizationId: string,
  now = new Date().toISOString(),
) {
  const normalizedBlocks = await normalizeEditorContentBlocks(db, blocks, { organizationId })
  const placementScope = { organizationId }
  return {
    blocks: normalizedBlocks,
    placementQueries: await contentBlockPlacementQueries(db, normalizedBlocks, placementScope, now),
  }
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
  scope: { organizationId: string },
) {
  if (!Array.isArray(input.content_blocks) || !input.content_blocks.length) badRequest('content_blocks are required')
  return await normalizeEditorContentBlocks(db, input.content_blocks, scope)
}

function parseTags<T extends Record<string, unknown>>(record: T) {
  const normalized = { ...record } as T & { tags?: string[]; tags_metadata?: unknown }
  if ('tags_metadata' in record) {
    normalized.tags = parseStringArray(record.tags_metadata)
    delete normalized.tags_metadata
  }
  return normalized
}

/** Read-model shape shared by every article loader: tags parsed, cover lifted from the leading image block. */
export function attachCover(record: ApiRecord) {
  return attachCoverMedia(parseTags(record))
}

export interface ContentReviewContext { orgSlug: string }

async function contentReviewUrls(
  record: ApiRecord,
  publicPath: string | null,
  organizationId: string,
  context?: ContentReviewContext,
  env?: CloudflareEnv,
) {
  const id = String(record.id ?? '')
  // Every site's articles, KrabiClaw's included, are edited in the shared dashboard CMS.
  const adminEditUrl = context ? `/dashboard/${context.orgSlug}/blog/${id}` : null
  const isPublished = typeof record.status === 'string' ? record.status === 'published' : Boolean(record.published_at)

  // An unpublished article is previewed the same way everything unpublished is
  // previewed: the site's own preview token, which the tenant host turns into a
  // cookie so the rest of the visit stays authorized.
  let previewUrl: string | null = null
  if (!isPublished && publicPath) {
    if (!env?.PREVIEW_SECRET) throw new HTTPError({ statusCode: 500, statusMessage: 'Preview signing is not configured' })
    const token = await createPreviewToken(env.PREVIEW_SECRET, organizationId, Date.now() + PREVIEW_TOKEN_TTL_MS)
    previewUrl = `${publicPath}?${PREVIEW_TOKEN_QUERY}=${encodeURIComponent(token)}`
  }

  return {
    ...record,
    admin_edit_url: adminEditUrl,
    edit_url: adminEditUrl,
    public_path: publicPath,
    public_url: isPublished ? publicPath : null,
    preview_url: previewUrl,
  }
}

async function resolveTenantContext(db: DbClient, organizationId: string, env?: CloudflareEnv): Promise<ContentReviewContext | undefined> {
  if (!organizationId) return undefined
  if (!env) throw new Error('CloudflareEnv is required to resolve tenant organization context')
  // The dashboard addresses a site by its subdomain, not by `organization.slug`.
  const tenant = await queryFirst<{ subdomain: string | null }>(
    db,
    'SELECT subdomain FROM organization WHERE id = ? LIMIT 1',
    [organizationId],
  )
  if (!tenant?.subdomain) return undefined
  const organization = await findOrganizationById(env, organizationId)
  if (!organization) return undefined
  return { orgSlug: organization.slug }
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

/**
 * Shared by the public docs API route and the docs page's SSR data fetch.
 * See getPublishedBlogPost above for why the page must call this
 * directly rather than doing a nested self-fetch back to the API route.
 */
function normalizeBlankToNull(input: { canonical_url?: string | null }) {
  if (input.canonical_url !== undefined && input.canonical_url?.trim() === '') input.canonical_url = null
}

// KrabiClaw's own collections have fixed category taxonomies because the category
// shapes the URL; a tenant's blog category is free text.
function validateBlogCommon(input: Partial<PlatformBlogCreateInput>, isTenant: boolean, operation: 'create' | 'update') {
  if (isTenant && input.collection !== undefined && input.collection !== null && input.collection !== 'blog') badRequest('Only KrabiClaw\'s own site publishes collections other than the blog')
  const writable = new Set<string>([...BLOG_UPDATE_MUTATION_FIELDS, operation === 'create' ? 'scheduled_for' : 'expected_updated_at'])
  if (operation === 'create') { writable.add('status'); writable.delete('redirect_old_slug'); writable.delete('reset_slug_override') }
  const unknown = Object.keys(input).find(field => !writable.has(field))
  if (unknown) badRequest(unknown + ' is not writable through article ' + operation)
  normalizeBlankToNull(input)
  if ('visibility' in input && input.visibility !== undefined && !['public', 'unlisted'].includes(String(input.visibility))) badRequest('visibility must be public or unlisted')
  if (input.title !== undefined) assertStringLength(input.title, BLOG_TITLE_MAX, 'title')
  if (input.excerpt !== undefined) assertStringLength(input.excerpt ?? null, BLOG_EXCERPT_MAX, 'excerpt')
  if (input.category !== undefined) assertStringLength(input.category ?? null, BLOG_CATEGORY_MAX, 'category')
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) badRequest('tags must be an array of non-empty strings up to 80 characters each')
    input.tags = [...new Set(input.tags.map(tag => tag.trim()))].slice(0, 20)
  }
  if (input.seo_title !== undefined) assertStringLength(input.seo_title ?? null, BLOG_SEO_TITLE_MAX, 'seo_title')
  if (input.seo_description !== undefined) assertStringLength(input.seo_description ?? null, BLOG_SEO_DESCRIPTION_MAX, 'seo_description')
  if (input.seo_keywords !== undefined) assertStringLength(input.seo_keywords ?? null, BLOG_SEO_KEYWORDS_MAX, 'seo_keywords')
  if (input.canonical_url !== undefined) assertValidCanonicalUrl(input.canonical_url)
  normalizeRobotsField(input)
}

/**
 * KrabiClaw's published articles in one collection. The blog reads newest first;
 * documentation reads in its editorial order (sort_order, then title).
 */
export async function listPublicPlatformBlogPosts(db: DbClient, collection: ArticleCollection = 'blog') {
  const platformSiteId = (await getPlatformSite(db)).id
  const sql = `
    SELECT
      p.id, p.title, p.slug, p.summary AS excerpt, (p.metadata_json ->> '$.collection') AS collection, (p.metadata_json ->> '$.category') AS category,
      p.seo_description, p.seo_keywords, p.canonical_url, p.robots, p.published_at, p.updated_at, p.sort_order, ${COVER_SELECT}
    FROM content_documents p
    ${coverJoinSql('p')}
    WHERE p.kind = 'article' AND p.row_role = 'root' AND p.status = 'published' AND p.organization_id = ? AND p.visibility = 'public'
      AND (p.metadata_json ->> '$.collection') = ?
    ORDER BY ${collection === 'docs' ? 'p.sort_order, p.title' : 'p.published_at DESC'}
    LIMIT 200
  `

  return (await queryAll<ApiRecord>(db, sql, [platformSiteId, collection])).map(attachCover)
}

export async function listBlogPosts(db: DbClient, organizationId: string, status?: string | null, env?: CloudflareEnv) {
  let sql = `SELECT
      p.id, p.title, p.slug, p.summary AS excerpt, (p.metadata_json ->> '$.collection') AS collection, (p.metadata_json ->> '$.category') AS category, json_extract(p.metadata_json, '$.tags') AS tags_metadata, p.status, p.visibility, p.scheduled_for,
      p.seo_title, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
      ${COVER_SELECT},
      p.published_at, p.created_at, p.updated_at
    FROM content_documents p
    ${coverJoinSql('p')}
    WHERE p.kind = 'article' AND p.row_role = 'root' AND p.organization_id = ?`
  const params: ApiValue[] = [organizationId]
  if (status === 'published') sql += " AND p.status = 'published'"
  else if (status === 'scheduled') sql += " AND p.status = 'scheduled'"
  else if (status === 'draft') sql += " AND p.status = 'draft'"
  sql += ' ORDER BY p.published_at IS NULL, p.published_at DESC, p.created_at DESC'
  const results = await queryAll<ApiRecord>(db, sql, params)
  const [context, site] = await Promise.all([resolveTenantContext(db, organizationId, env), loadSiteTemplate(db, organizationId)])
  return Promise.all((results ?? []).map((record) => {
    const slug = typeof record.slug === 'string' ? record.slug : ''
    const publicPath = slug ? tenantBlogPostPath(site.template, slug, articleCollectionOf(record.collection)) : null
    return contentReviewUrls(attachCover(attachPublished(record, Boolean(record.published_at))), publicPath, organizationId, context, env)
  }))
}

export async function getBlogPost(db: DbClient, postIdOrSlug: string, organizationId: string, env?: CloudflareEnv) {
  const postId = await resolvePlatformContentId(db, 'article', postIdOrSlug, 'Post not found', organizationId)
  const post = await queryFirst<ApiRecord | null>(
    db,
    `SELECT
       p.id, p.title, p.slug, p.summary AS excerpt, (p.metadata_json ->> '$.collection') AS collection, (p.metadata_json ->> '$.category') AS category, json_extract(p.metadata_json, '$.tags') AS tags_metadata, p.status, p.visibility, p.scheduled_for,
       p.first_published_at, (p.metadata_json ->> '$.slug_manually_overridden') AS slug_manually_overridden,
       p.seo_title, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
       ${COVER_SELECT},
       p.organization_id, p.kind, p.row_role, p.root_id, p.locale,
       p.published_at, p.created_at, p.updated_at
     FROM content_documents p
     ${coverJoinSql('p')}
     WHERE p.kind = 'article' AND p.row_role = 'root' AND p.id = ?`,
    [postId],
  )
  if (!post) notFound('Post not found')
  // The row above IS the article's content document, and the blocks are read
  // once for both shapes the response needs: the outline the editor renders
  // and the raw rows the markdown body is built from. This used to re-read the
  // document and then the blocks a second time.
  const { organization_id, kind, row_role, root_id, locale, ...postFields } = post
  const document = {
    id: String(post.id), organization_id: String(organization_id),
    kind: String(kind), row_role: String(row_role),
    root_id: root_id === null || root_id === undefined ? null : String(root_id),
    locale: String(locale), created_at: String(post.created_at), updated_at: String(post.updated_at),
  } as ContentDocumentRow
  const rawBlocks = await listBlocksForDocument(db, document.id)
  const contentDocument = {
    document,
    blocks: await attachContentBlockMedia(db, document.id, rawBlocks.map(formatBlockOutline)),
  }
  const slug = typeof postFields.slug === 'string' ? postFields.slug : ''
  const [context, site] = await Promise.all([resolveTenantContext(db, organizationId, env), loadSiteTemplate(db, organizationId)])
  const publicPath = slug ? tenantBlogPostPath(site.template, slug, articleCollectionOf(postFields.collection)) : null
  const editorThemeTokenRow = await queryFirst<{ tokens_json: string | null } | null>(db, `
    SELECT json_extract(settings_json, ? || '.tokens') AS tokens_json FROM organization
     WHERE id = ? AND json_extract(settings_json, ? || '.status') = 'active'
     LIMIT 1
  `, ['$.theme_by_template.' + site.template.slug, organizationId, '$.theme_by_template.' + site.template.slug])
  const editorThemeTokens = parseBlogEditorThemeTokens(editorThemeTokenRow?.tokens_json)
  return {
    ...await contentReviewUrls(attachCover(attachPublished(postFields, Boolean(postFields.published_at))), publicPath, organizationId, context, env),
    tags: parseStringArray(postFields.tags_metadata),
    body: renderContentBlocksToMarkdown(rawBlocks),
    content_document: contentDocument,
    editor_template: site.template.slug,
    editor_theme_tokens: editorThemeTokens,
    editor_site_name: site.name,
    editor_brand_color: site.brand_color ?? null,
  }
}

export async function getPublicSiteBlogPost(db: DbClient, organizationId: string, slug: string, env: CloudflareEnv, previewAuthorized = false) {
  const post = await queryFirst<ApiRecord>(db, `
    SELECT
      p.id, p.title, p.slug, p.summary AS excerpt, (p.metadata_json ->> '$.category') AS category, json_extract(p.metadata_json, '$.tags') AS tags_metadata, p.seo_title, p.seo_description, p.seo_keywords,
      p.canonical_url, p.robots, p.visibility,
      p.published_at, p.created_at, p.updated_at,
      p.author_id,
      ${COVER_SELECT}
    FROM content_documents p
    ${coverJoinSql('p')}
    WHERE p.kind = 'article' AND p.row_role = 'root' AND p.slug = ? AND p.organization_id = ?
      ${previewAuthorized ? "AND p.status IN ('draft', 'scheduled', 'published')" : "AND p.status = 'published' AND (p.scheduled_for IS NULL OR p.scheduled_for <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"}
    LIMIT 1
  `, [slug, organizationId])

  if (!post) return null

  const contentDocument = await getContentDocumentById(db, String(post.id))
  if (!contentDocument) throw new HTTPError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  const [loadedBlocks, rawBlocks, site] = await Promise.all([
    getContentBlocksForDocument(db, String(post.id)),
    listBlocksForDocument(db, contentDocument.id),
    loadSiteTemplate(db, organizationId),
  ])
  const articlePath = tenantBlogPostPath(site.template, slug)
  const contentBlocks = loadedBlocks ? await attachPageQa(db, organizationId, articlePath, loadedBlocks) : loadedBlocks
  const socialMedia = (await loadPublicSocialMedia(db, organizationId, 'content_document', [String(post.id)])).get(String(post.id))
  const { author_id: authorId, ...postRecord } = post
  const authors = await findAuthUsersByIds(env, [authorId as string | null])
  const author = typeof authorId === 'string' ? authors.get(authorId) ?? null : null
  return {
    ...attachCover({ ...postRecord, content_blocks: contentBlocks ?? [], body: renderContentBlocksToMarkdown(rawBlocks) }),
    media: socialMedia?.media ?? [],
    social_image: socialMedia?.social_image ?? null,
    author: author ? { id: author.id, name: author.name, image: author.image } : null,
  }
}

/** One published article, by slug, in the locale asked for. */
export async function getPublishedBlogPost(
  db: DbClient,
  organizationId: string,
  slug: string,
  locale: string,
  env: CloudflareEnv,
  previewAuthorized = false,
) {
  const site = await queryFirst<{ organization_id: string; vertical: string }>(db, `
    SELECT organization_id, vertical FROM organization WHERE id = ? AND status = 'active' LIMIT 1
  `, [organizationId])
  if (!site) return null
  const prefix = normalizeVertical(site.vertical) === 'service' ? 'article' : 'blog'
  if (locale === 'en') {
    const post = await getPublicSiteBlogPost(db, organizationId, slug, env, previewAuthorized)
    if (!post || typeof post.id !== 'string') return post
    return {
      ...post,
      localeRepresentations: await listPublicLocaleRepresentations(env, db, {
        organizationId,
        sourcePath: `/${prefix}/${slug}`,
        documentId: post.id,
      }),
    }
  }

  const localizations = await loadExactPublicLocalizations(env, db, organizationId, locale)
  const row = await queryFirst<{ id: string; root_id: string; title: string | null; summary: string | null;
    seo_title: string | null; seo_description: string | null; seo_keywords: string | null; metadata_json: string;
    source_slug: string; updated_at: string }>(db, `
    SELECT d.id, d.root_id, d.title, d.summary, d.seo_title, d.seo_description, d.seo_keywords, d.metadata_json,
           d.updated_at, root.slug AS source_slug
      FROM content_documents d JOIN content_documents root ON root.id = d.root_id
     WHERE d.organization_id = ? AND d.locale = ? AND d.path = ? AND d.row_role = 'representation'
       AND root.kind = 'article' AND root.row_role = 'root'
       ${previewAuthorized ? '' : "AND root.status = 'published'"} LIMIT 1
  `, [organizationId, locale, '/' + prefix + '/' + slug])
  if (!row) return null
  const canonical = await getPublicSiteBlogPost(db, organizationId, row.source_slug, env, previewAuthorized)
  if (!canonical) return null
  const metadata = JSON.parse(row.metadata_json) as Record<string, unknown>
  const [outlineBlocks, rawBlocks, social] = await Promise.all([
    getContentOutline(db, row.id), listBlocksForDocument(db, row.id),
    loadPublicSocialMedia(db, organizationId, 'content_document', [row.id]),
  ])
  const contentBlocks = await attachPageQa(db, organizationId, '/' + prefix + '/' + row.source_slug, outlineBlocks, locale)
  return { ...canonical, id: row.id, title: row.title, excerpt: row.summary, slug,
    seo_title: row.title, seo_description: row.summary, seo_keywords: row.seo_keywords,
    category: metadata.category ?? null, tags: metadata.tags ?? [],
    canonical_url: null, updated_at: row.updated_at, body: renderContentBlocksToMarkdown(rawBlocks),
    content_blocks: contentBlocks.map(block => ({ ...block, media: projectLocalizedMediaAlt(block.media.map(item => ({ ...item, alt_text: item.alt_text ?? null })), localizations) })),
    media: projectLocalizedMediaAlt(social.get(row.id)?.media ?? [], localizations),
    social_image: social.get(row.id)?.social_image ?? null,
    localeRepresentations: await listPublicLocaleRepresentations(env, db, { organizationId,
      sourcePath: '/' + prefix + '/' + row.source_slug, documentId: row.root_id }),
  }
}

export async function createBlogPost(
  db: D1Database,
  authorId: string,
  input: PlatformBlogCreateInput,
  scope: BlogScope = {},
  env?: CloudflareEnv,
) {
  if (!input.title?.trim()) badRequest('title is required')
  const organizationId = scope.organization_id
  if (!organizationId) badRequest('organization_id is required')
  const site = await loadSiteTemplate(db, organizationId)
  const isTenant = !site.isPlatform
  validateBlogCommon(input, isTenant, 'create')
  const collection = articleCollectionOf(input.collection)
  const placementScope = { organizationId }
  const id = crypto.randomUUID()
  const customSlug = typeof input.slug === 'string' && input.slug.trim()
    ? normalizeBlogSlug(input.slug)
    : null
  const slugBase = customSlug ?? normalizeSlugFromTitle(input.title, 'post')
  const now = new Date().toISOString()
  let scheduledFor: string | null = null
  try { scheduledFor = parseScheduledFor(input.scheduled_for) } catch (error) { badRequest((error as Error).message) }
  if (scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) badRequest('scheduled_for must be in the future')
  const status = input.status ?? (scheduledFor ? 'scheduled' : 'draft')
  if (!['draft', 'scheduled', 'published'].includes(status)) badRequest('status must be draft, scheduled or published')
  if (status === 'scheduled' && !scheduledFor) badRequest('scheduled articles require scheduled_for')
  if (status !== 'scheduled' && scheduledFor) badRequest('scheduled_for is only valid for scheduled articles')
  if (status !== 'published' && !env?.PREVIEW_SECRET) throw new HTTPError({ statusCode: 500, statusMessage: 'Article preview signing is not configured' })
  const publishedAt = status === 'published' ? now : null
  if (input.visibility && !['public', 'unlisted'].includes(input.visibility)) badRequest('visibility must be public or unlisted')
  const canonicalBlocks = await normalizeCanonicalBlogBlocks(db, input, placementScope)
  const canonicalBody = renderCanonicalBlogBody(canonicalBlocks)

  const slugAttempts = customSlug ? 1 : MAX_SLUG_ATTEMPTS
  for (let attempt = 0; attempt < slugAttempts; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      await createContentDocumentWithBlocks(db, {
        id, rowRole: 'root', locale: 'en', kind: 'article', organizationId,
        title: input.title, slug, summary: input.excerpt ?? null, status, visibility: input.visibility ?? 'public',
        authorId, scheduledFor, publishedAt, firstPublishedAt: publishedAt,
        seoTitle: input.seo_title, seoDescription: input.seo_description, seoKeywords: input.seo_keywords,
        canonicalUrl: input.canonical_url, robots: input.robots,
        metadata: { collection, category: input.category ?? null, tags: input.tags ?? null, slug_manually_overridden: customSlug ? 1 : 0 },
      }, canonicalBlocks, { bodyMarkdown: canonicalBody,
        additionalQueriesAfter: await contentBlockPlacementQueries(db, canonicalBlocks, placementScope, now),
      })
      const post = await getBlogPost(db, id, organizationId, env)
      if (env) await refreshSocialCard({ db, env, owner: { owner_type: 'content_document', owner_id: id }, actorId: authorId })
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
      if (customSlug && isUniqueConstraintError(err)) badRequest('slug is already in use')
      if (isUniqueConstraintError(err) && attempt < slugAttempts - 1) continue
      throw err
    }
  }

  throw new HTTPError({ statusCode: 500, statusMessage: 'Failed to create post' })
}

export async function updateBlogLifecycle(
  db: D1Database,
  postIdOrSlug: string,
  input: PlatformBlogLifecycleInput,
  organizationId: string,
): Promise<PlatformBlogLifecycleState> {
  if (!input.expected_updated_at?.trim()) badRequest('expected_updated_at is required')

  let scheduledFor: string | null = null
  try { scheduledFor = parseScheduledFor(input.scheduled_for) } catch (error) { badRequest((error as Error).message) }
  if (scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) badRequest('scheduled_for must be in the future')

  const sourceId = await resolvePlatformContentId(db, 'article', postIdOrSlug, 'Post not found', organizationId)
  const source = await queryFirst<{ id: string; status: string; updated_at: string }>(db,
    "SELECT id, status, updated_at FROM content_documents WHERE id = ? AND row_role = 'root' AND kind = 'article'", [sourceId])
  if (!source) notFound('Post not found')
  if (source.status !== 'draft' && source.status !== 'scheduled') badRequest('Only a draft or scheduled article can be published or scheduled')
  if (source.updated_at !== input.expected_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Article was updated by another writer' })
  }
  const committedAt = new Date(Math.max(Date.now(), Date.parse(source.updated_at) + 1)).toISOString()
  const [result] = await executeBatch(db, [{ query: `UPDATE content_documents SET scheduled_for = ?,
    published_at = ?, first_published_at = CASE WHEN ? IS NULL THEN COALESCE(first_published_at, ?) ELSE first_published_at END,
    status = ?, updated_at = ? WHERE id = ? AND kind = 'article' AND row_role = 'root' AND updated_at = ? AND status IN ('draft', 'scheduled')`,
  params: [scheduledFor, scheduledFor ? null : committedAt, scheduledFor, committedAt,
    scheduledFor ? 'scheduled' : 'published', committedAt, source.id, input.expected_updated_at] },
  publicResourceCacheInvalidationQuery(organizationId, 'article-publication')])
  if (Number(result?.meta.changes ?? 0) !== 1) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Article was updated by another writer' })
  }
  return { id: source.id, status: scheduledFor ? 'scheduled' as const : 'published' as const,
    published_at: scheduledFor ? null : committedAt, scheduled_for: scheduledFor, updated_at: committedAt }
}

export async function updateBlogPost(
  db: D1Database, postIdOrSlug: string, input: PlatformBlogUpdateInput,
  organizationId: string, env?: CloudflareEnv,
) {
  if (!BLOG_UPDATE_MUTATION_FIELDS.some(field => input[field] !== undefined)) badRequest('At least one blog mutation field is required')
  const postId = await resolvePlatformContentId(db, 'article', postIdOrSlug, 'Post not found', organizationId)
  const isTenant = !(await loadSiteTemplate(db, organizationId)).isPlatform
  validateBlogCommon(input, isTenant, 'update')
  const current = await queryFirst<{ organization_id: string; collection: string | null; category: string | null; title: string; slug: string;
    first_published_at: string | null; slug_manually_overridden: number; updated_at: string }>(db, `
    SELECT organization_id, metadata_json ->> '$.collection' AS collection, metadata_json ->> '$.category' AS category, title, slug, first_published_at,
      metadata_json ->> '$.slug_manually_overridden' AS slug_manually_overridden, updated_at
    FROM content_documents WHERE id = ? AND kind = 'article' AND row_role = 'root'`, [postId])
  if (!current) notFound('Post not found')
  if (input.content_blocks !== undefined && !input.expected_updated_at) badRequest('expected_updated_at is required with content_blocks')
  const effectiveCollection = articleCollectionOf(input.collection === undefined ? current.collection : input.collection)
  const placementScope = { organizationId }
  const normalizedBlocks = input.content_blocks === undefined ? undefined : await normalizeEditorContentBlocks(db, input.content_blocks, placementScope)
  const metadata: Record<string, unknown> = {}
  const changes: ContentDocumentChanges = { metadata }
  if (input.title !== undefined) {
    if (!input.title.trim()) badRequest('title cannot be blank')
    changes.title = input.title
    if (!current.first_published_at && !current.slug_manually_overridden && input.slug === undefined) changes.slug = normalizeBlogSlug(input.title)
  }
  if (input.reset_slug_override && input.slug !== undefined && input.slug !== null) badRequest('reset_slug_override cannot be combined with a manual slug')
  const slugMutation = resolveSlugMutation({ requestedSlug: input.reset_slug_override ? null : input.slug,
    title: input.title ?? current.title, currentSlug: current.slug, manuallyOverridden: Boolean(current.slug_manually_overridden) })
  const requestedSlug = input.slug !== undefined || input.reset_slug_override ? slugMutation.slug : changes.slug
  if (requestedSlug && requestedSlug !== current.slug) {
    const redirect = await queryFirst<{ id: string }>(db, `SELECT id FROM organization_redirects WHERE organization_id = ? AND locale = 'en' AND from_path IN (?, ?, ?) LIMIT 1`,
      [organizationId, `/blog/${requestedSlug}`, `/article/${requestedSlug}`, `/${requestedSlug}`])
    if (redirect) badRequest('Slug collides with redirect history')
    changes.slug = requestedSlug
    if (input.slug !== undefined || input.reset_slug_override) metadata.slug_manually_overridden = slugMutation.manuallyOverridden ? 1 : 0
  } else if (input.reset_slug_override) metadata.slug_manually_overridden = 0
  for (const field of ['seo_title', 'seo_description', 'seo_keywords', 'canonical_url', 'visibility'] as const) {
    if (input[field] !== undefined) changes[field] = input[field]
  }
  if (input.excerpt !== undefined) changes.summary = input.excerpt
  if (input.collection !== undefined) metadata.collection = effectiveCollection
  if (input.category !== undefined) metadata.category = input.category
  if (input.tags !== undefined) metadata.tags = input.tags
  const now = new Date().toISOString()
  try {
    await updateContentDocument(db, postId, {
      expected_updated_at: input.expected_updated_at ?? current.updated_at, blocks: normalizedBlocks, changes,
      additionalQueriesAfter: [...(normalizedBlocks ? await contentBlockPlacementQueries(db, normalizedBlocks, placementScope, now) : []),
        ...(input.visibility === undefined ? [] : [publicResourceCacheInvalidationQuery(organizationId, 'article-visibility')])],
    })
    if (requestedSlug && requestedSlug !== current.slug && current.first_published_at && input.redirect_old_slug !== false) {
      await createBlogRedirect(db, postId, organizationId, current.slug)
    }
    const post = await getBlogPost(db, postId, organizationId, env)
    if (env) await refreshSocialCard({ db, env, owner: { owner_type: 'content_document', owner_id: postId } })
    return { success: true, admin_edit_url: post.admin_edit_url, edit_url: post.edit_url,
      public_path: post.public_path, public_url: post.public_url, preview_url: post.preview_url, post }
  } catch (error) {
    if (isUniqueConstraintError(error)) badRequest('Slug already in use')
    throw error
  }
}

export async function deleteBlogPost(db: D1Database, postIdOrSlug: string, organizationId: string) {
  const postId = await resolvePlatformContentId(db, 'article', postIdOrSlug, 'Post not found', organizationId)
  const document = await getContentDocumentById(db, postId)
  if (!document) notFound('Document not found')
  await executeBatch(db, prepareContentDocumentDeletion({ documentId: document.id,
    organizationId: document.organization_id }))
  return { success: true }
}
