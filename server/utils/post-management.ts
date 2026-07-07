import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { fireSiteEventSafe } from '~/server/utils/site-events'
import { normalizePostSlug, postPublicPath } from '~/utils/post-slugs'
import { platformHostnameFallback, type DomainEnv } from '~/server/utils/domains'

export { normalizePostSlug, postPublicPath }

const MAX_SLUG_ATTEMPTS = 20

export class PostValidationError extends Error {
  statusCode = 400
}

export interface PostMediaInput {
  media_asset_id: string
  role?: 'cover' | 'gallery'
  sort_order?: number
  caption?: string | null
  alt_text?: string | null
}

export interface PostMediaItem {
  id: string
  post_id: string
  media_asset_id: string
  role: 'cover' | 'gallery'
  sort_order: number
  caption: string | null
  alt_text: string | null
  public_url: string | null
  thumbnail_url: string | null
  kind: string | null
  width?: number | null
  height?: number | null
}

export interface PublicPostMedia {
  id?: string
  mediaAssetId?: string
  url: string
  googleUrl: string
  thumbnailUrl?: string | null
  kind: 'image' | 'video'
  mediaFormat: 'IMAGE' | 'VIDEO'
  role?: 'cover' | 'gallery'
  caption?: string | null
  alt?: string | null
  altText?: string | null
  width?: number | null
  height?: number | null
}

export interface Post {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  google_post_id: string | null
  slug: string | null
  post_type: 'standard' | 'offer' | 'event' | 'update'
  title: string | null
  body: string
  image_asset_id: string | null
  seo_title: string | null
  seo_description: string | null
  og_image_asset_id: string | null
  /** Resolved cover-media URL injected by joins, not a DB column. */
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
  public_path?: string | null
  canonical_url?: string | null
  media?: PublicPostMedia[]
  gallery_media?: PublicPostMedia[]
  cta_type: string | null
  cta_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon: string | null
  offer_terms: string | null
  status: 'draft' | 'published' | 'scheduled' | 'archived'
  scheduled_for: string | null
  published_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PostChannelJob {
  id: string
  post_id: string
  organization_id: string
  channel: 'site' | 'gmb' | 'instagram' | 'facebook'
  status: 'pending' | 'published' | 'failed' | 'skipped'
  provider_post_id: string | null
  error: string | null
  published_at: string | null
  created_at: string
}

export interface PostWithChannels extends Post {
  channels: PostChannelJob[]
}

type SqlBindValue = string | number | boolean | null

interface SiteUrlRow {
  public_url: string | null
  subdomain: string | null
}

interface PublishedPostSummary {
  id: string
  slug: string
  name: string
  title: string
  summary: string
  createTime: string | null
  publicPath: string
  public_path: string
  canonicalUrl: string | null
  canonical_url: string | null
  url: string | null
  media: PublicPostMedia[]
  gallery: PublicPostMedia[]
  callToAction?: { actionType: string | null; url: string } | null
  event?: { title: string | null; startDate: string | null; endDate: string | null } | null
  offer?: { title: string | null; couponCode: string | null; terms: string | null } | null
  location?: { id: string; title: string | null; slug: string | null } | null
}

interface PublishedPostRow {
  id: string
  site_id: string
  location_id: string | null
  location_title: string | null
  location_slug: string | null
  slug: string | null
  post_type: 'standard' | 'offer' | 'event' | 'update'
  title: string | null
  body: string
  image_asset_id: string | null
  seo_title: string | null
  seo_description: string | null
  og_image_asset_id: string | null
  cta_type: string | null
  cta_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon: string | null
  offer_terms: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  public_url: string | null
  thumbnail_url: string | null
  kind: string | null
  width?: number | null
  height?: number | null
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeRole(value: unknown): 'cover' | 'gallery' {
  return value === 'cover' ? 'cover' : 'gallery'
}

function normalizeMediaInputs(value: unknown): PostMediaInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return []
  const media: PostMediaInput[] = []
  value.forEach((item, index) => {
    if (typeof item === 'string') {
      const mediaAssetId = item.trim()
      if (mediaAssetId) media.push({ media_asset_id: mediaAssetId, sort_order: index })
      return
    }
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const mediaAssetId = cleanString(record.media_asset_id ?? record.mediaAssetId ?? record.asset_id ?? record.id)
    if (!mediaAssetId) return
    media.push({
      media_asset_id: mediaAssetId,
      role: normalizeRole(record.role),
      sort_order: Number.isFinite(Number(record.sort_order)) ? Number(record.sort_order) : index,
      caption: cleanString(record.caption),
      alt_text: cleanString(record.alt_text ?? record.altText),
    })
  })
  return media
}

function absoluteUrl(origin: string | null, path: string) {
  if (!origin) return null
  return new URL(path, origin.endsWith('/') ? origin : `${origin}/`).toString()
}

async function resolveSitePublicOrigin(db: DbClient, siteId: string, env: DomainEnv) {
  const site = await queryFirst<SiteUrlRow>(
    db,
    `SELECT public_url, subdomain FROM sites WHERE id = ? LIMIT 1`,
    [siteId],
  )
  const publicUrl = site?.public_url?.trim().replace(/\/$/, '')
  if (publicUrl) return publicUrl
  const subdomain = site?.subdomain?.trim()
  return subdomain ? `https://${subdomain}.${platformHostnameFallback(env)}` : null
}

async function allocatePostSlug(db: DbClient, siteId: string, source: string, excludePostId?: string) {
  const base = normalizePostSlug(source)
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const existing = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM posts WHERE site_id = ? AND slug = ? ${excludePostId ? 'AND id != ?' : ''} LIMIT 1`,
      excludePostId ? [siteId, slug, excludePostId] : [siteId, slug],
    )
    if (!existing) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

async function requireActiveMediaAsset(
  db: DbClient,
  organizationId: string,
  siteId: string,
  mediaAssetId: string,
  fieldName: string,
) {
  const asset = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM media_assets WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active' LIMIT 1`,
    [mediaAssetId, organizationId, siteId],
  )
  if (!asset) throw new PostValidationError(`Invalid ${fieldName}`)
}

async function replacePostMedia(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
  coverAssetId: string | null | undefined,
  galleryInput: PostMediaInput[] | undefined,
  validateCover = true,
) {
  if (coverAssetId && validateCover) await requireActiveMediaAsset(db, organizationId, siteId, coverAssetId, 'image_asset_id')
  for (const item of galleryInput ?? []) {
    await requireActiveMediaAsset(db, organizationId, siteId, item.media_asset_id, 'gallery media asset')
  }

  if (galleryInput === undefined) {
    return
  }

  await execute(db, `DELETE FROM post_media WHERE post_id = ? AND organization_id = ? AND site_id = ?`, [postId, organizationId, siteId])

  const now = new Date().toISOString()
  const rows: PostMediaInput[] = []
  if (coverAssetId) rows.push({ media_asset_id: coverAssetId, role: 'cover', sort_order: 0 })
  
  // Deduplicate gallery input by media_asset_id and filter out cover asset
  const seenAssetIds = new Set<string>()
  if (coverAssetId) seenAssetIds.add(coverAssetId)
  
  const deduplicatedGallery = galleryInput.filter(item => {
    if (seenAssetIds.has(item.media_asset_id)) return false
    seenAssetIds.add(item.media_asset_id)
    return true
  })
  
  rows.push(...deduplicatedGallery)

  const queries = rows.map((item, index) => ({
    query: `
      INSERT INTO post_media (id, organization_id, site_id, post_id, media_asset_id, role, sort_order, caption, alt_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    params: [
      crypto.randomUUID(),
      organizationId,
      siteId,
      postId,
      item.media_asset_id,
      item.role ?? 'gallery',
      Number.isFinite(item.sort_order) ? Number(item.sort_order) : index,
      item.caption ?? null,
      item.alt_text ?? null,
      now,
      now,
    ],
  }))
  if (queries.length > 0) await executeBatch(db, queries)
}

async function syncPostCoverMedia(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
  coverAssetId: string | null,
) {
  if (coverAssetId) await requireActiveMediaAsset(db, organizationId, siteId, coverAssetId, 'image_asset_id')

  await execute(
    db,
    `DELETE FROM post_media WHERE post_id = ? AND organization_id = ? AND site_id = ? AND role = 'cover'`,
    [postId, organizationId, siteId],
  )

  if (!coverAssetId) return

  // Check if cover with same media_asset_id already exists to avoid unique index conflict
  const existingCover = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM post_media WHERE post_id = ? AND media_asset_id = ? AND role = 'cover' LIMIT 1`,
    [postId, coverAssetId],
  )
  if (existingCover) return

  const now = new Date().toISOString()
  await execute(
    db,
    `
      INSERT INTO post_media (id, organization_id, site_id, post_id, media_asset_id, role, sort_order, caption, alt_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'cover', 0, NULL, NULL, ?, ?)
    `,
    [crypto.randomUUID(), organizationId, siteId, postId, coverAssetId, now, now],
  )
}

async function getPostMediaByPostIds(db: DbClient, postIds: string[]) {
  if (postIds.length === 0) return new Map<string, PostMediaItem[]>()
  const placeholders = postIds.map(() => '?').join(', ')
  const rows = await queryAll<PostMediaItem>(
    db,
    `
    SELECT pm.id, pm.post_id, pm.media_asset_id, pm.role, pm.sort_order, pm.caption, pm.alt_text,
           ma.public_url, ma.thumbnail_url, ma.kind, ma.width, ma.height
    FROM post_media pm
    JOIN media_assets ma ON pm.media_asset_id = ma.id AND ma.status = 'active'
    WHERE pm.post_id IN (${placeholders})
    ORDER BY pm.post_id,
             CASE pm.role WHEN 'cover' THEN 0 ELSE 1 END,
             pm.sort_order ASC,
             pm.created_at ASC
  `,
    postIds,
  )
  const byPost = new Map<string, PostMediaItem[]>()
  for (const row of rows ?? []) {
    const items = byPost.get(row.post_id) ?? []
    items.push(row)
    byPost.set(row.post_id, items)
  }
  return byPost
}

function publicMediaFromRows(rows: PostMediaItem[] | undefined, fallback?: PublishedPostRow | Post): PublicPostMedia[] {
  const media = (rows ?? [])
    .filter((row) => row.public_url && (row.kind === 'image' || row.kind === 'video'))
    .map((row) => ({
      id: row.id,
      mediaAssetId: row.media_asset_id,
      url: row.public_url!,
      googleUrl: row.public_url!,
      thumbnailUrl: row.thumbnail_url,
      kind: row.kind === 'video' ? 'video' as const : 'image' as const,
      mediaFormat: row.kind === 'video' ? 'VIDEO' as const : 'IMAGE' as const,
      role: row.role,
      caption: row.caption,
      alt: row.alt_text,
      altText: row.alt_text,
      width: row.width ?? null,
      height: row.height ?? null,
    }))
  if (media.length > 0 || !fallback?.public_url || (fallback.kind !== 'image' && fallback.kind !== 'video')) return media
  return [{
    mediaAssetId: fallback.image_asset_id ?? undefined,
    url: fallback.public_url,
    googleUrl: fallback.public_url,
    thumbnailUrl: fallback.thumbnail_url ?? null,
    kind: fallback.kind === 'video' ? 'video' : 'image',
    mediaFormat: fallback.kind === 'video' ? 'VIDEO' : 'IMAGE',
    role: 'cover',
    alt: fallback.title ?? null,
    altText: fallback.title ?? null,
    width: 'width' in fallback ? fallback.width ?? null : null,
    height: 'height' in fallback ? fallback.height ?? null : null,
  }]
}

function attachPostPublicFields<T extends Post>(
  post: T,
  mediaRows: PostMediaItem[] | undefined,
  origin: string | null,
): T {
  const slug = post.slug ?? post.id
  const publicPath = postPublicPath(slug)
  const media = publicMediaFromRows(mediaRows, post)
  return {
    ...post,
    slug,
    public_path: publicPath,
    canonical_url: absoluteUrl(origin, publicPath),
    media,
    gallery_media: media,
  }
}

function formatPublishedPost(row: PublishedPostRow, mediaRows: PostMediaItem[] | undefined, origin: string | null): PublishedPostSummary {
  const slug = row.slug ?? row.id
  const publicPath = postPublicPath(slug)
  const media = publicMediaFromRows(mediaRows, row)
  return {
    id: row.id,
    slug,
    name: `posts/${slug}`,
    title: row.title ?? '',
    summary: row.body,
    createTime: row.published_at ?? row.created_at,
    publicPath,
    public_path: publicPath,
    canonicalUrl: absoluteUrl(origin, publicPath),
    canonical_url: absoluteUrl(origin, publicPath),
    url: absoluteUrl(origin, publicPath),
    media,
    gallery: media,
    callToAction: row.cta_url ? { actionType: row.cta_type, url: row.cta_url } : null,
    event: row.post_type === 'event'
      ? { title: row.event_title ?? row.title, startDate: row.event_start, endDate: row.event_end }
      : null,
    offer: row.post_type === 'offer'
      ? { title: row.title, couponCode: row.offer_coupon, terms: row.offer_terms }
      : null,
    location: row.location_id
      ? { id: row.location_id, title: row.location_title, slug: row.location_slug }
      : null,
  }
}

export async function listPosts(
  db: DbClient,
  organizationId: string,
  siteId: string,
  env: DomainEnv,
  status?: string,
  locationId?: string,
): Promise<Post[]> {
  let query = `
    SELECT p.*, ma.public_url, ma.thumbnail_url, ma.kind
    FROM posts p
    LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
    WHERE p.organization_id = ? AND p.site_id = ?
  `
  const params: string[] = [organizationId, siteId]
  if (status) {
    query += ` AND p.status = ?`
    params.push(status)
  }
  if (locationId) {
    query += ` AND p.location_id = ?`
    params.push(locationId)
  }
  query += ` ORDER BY p.updated_at DESC LIMIT 100`
  const results = await queryAll<Post>(db, query, params)
  const origin = await resolveSitePublicOrigin(db, siteId, env)
  const mediaByPost = await getPostMediaByPostIds(db, (results ?? []).map((post) => post.id))
  return (results ?? []).map((post) => attachPostPublicFields(post, mediaByPost.get(post.id), origin))
}

export async function getPost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
  env: DomainEnv,
): Promise<PostWithChannels | null> {
  const post = await queryFirst<Post>(
    db,
    `
    SELECT p.*, ma.public_url, ma.thumbnail_url, ma.kind
    FROM posts p
    LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
    WHERE p.id = ? AND p.organization_id = ? AND p.site_id = ?
    LIMIT 1
  `,
    [postId, organizationId, siteId],
  )
  if (!post) return null

  const [jobs, origin, mediaByPost] = await Promise.all([
    queryAll<PostChannelJob>(db, `SELECT * FROM post_channel_jobs WHERE post_id = ? ORDER BY channel`, [postId]),
    resolveSitePublicOrigin(db, siteId, env),
    getPostMediaByPostIds(db, [postId]),
  ])

  return { ...attachPostPublicFields(post, mediaByPost.get(post.id), origin), channels: jobs ?? [] }
}

export async function createPost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  data: {
    title?: string; body: string; image_asset_id?: string | null; scheduled_for?: string
    location_id?: string; post_type?: string
    slug?: string | null; seo_title?: string | null; seo_description?: string | null; og_image_asset_id?: string | null
    cta_type?: string; cta_url?: string
    event_title?: string; event_start?: string; event_end?: string
    offer_coupon?: string; offer_terms?: string
    status?: 'draft' | 'published'
    gallery_media?: PostMediaInput[] | unknown
  },
  createdBy: string,
  env: DomainEnv,
): Promise<Post> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const status = data.status ?? (data.scheduled_for ? 'scheduled' : 'published')
  const publishedAt = status === 'published' ? now : null
  const title = cleanString(data.title)
  const body = data.body.trim()
  let slug = await allocatePostSlug(db, siteId, cleanString(data.slug) ?? title ?? body.slice(0, 80) ?? id)
  const imageAssetId = cleanString(data.image_asset_id)
  const ogImageAssetId = cleanString(data.og_image_asset_id)
  const galleryMedia = normalizeMediaInputs(data.gallery_media) ?? []

  if (imageAssetId) await requireActiveMediaAsset(db, organizationId, siteId, imageAssetId, 'image_asset_id')
  if (ogImageAssetId) await requireActiveMediaAsset(db, organizationId, siteId, ogImageAssetId, 'og_image_asset_id')
  for (const item of galleryMedia) await requireActiveMediaAsset(db, organizationId, siteId, item.media_asset_id, 'gallery media asset')

  // Retry slug allocation on unique constraint conflict (race condition)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await execute(
        db,
        `
        INSERT INTO posts (id, organization_id, site_id, location_id, slug, post_type, title, body, image_asset_id,
          seo_title, seo_description, og_image_asset_id,
          cta_type, cta_url, event_title, event_start, event_end, offer_coupon, offer_terms,
          status, scheduled_for, published_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          id, organizationId, siteId,
          data.location_id ?? null, slug, data.post_type ?? 'standard',
          title, body, imageAssetId,
          cleanString(data.seo_title), cleanString(data.seo_description), ogImageAssetId,
          data.cta_type ?? null, data.cta_url ?? null,
          data.event_title ?? null, data.event_start ?? null, data.event_end ?? null,
          data.offer_coupon ?? null, data.offer_terms ?? null,
          status, data.scheduled_for ?? null, publishedAt, createdBy, now, now,
        ],
      )
      break
    } catch (err) {
      const message = String((err as ApiValue)?.message || err || '')
      if (message.includes('posts_site_slug_idx') || message.includes('UNIQUE constraint failed') && message.includes('slug')) {
        slug = await allocatePostSlug(db, siteId, cleanString(data.slug) ?? title ?? body.slice(0, 80) ?? id)
        continue
      }
      throw err
    }
  }

  await replacePostMedia(db, organizationId, siteId, id, imageAssetId, galleryMedia)

  const createdPost = await getPost(db, organizationId, siteId, id, env)
  if (!createdPost) throw new Error('Post not found after creation')
  await fireSiteEventSafe({
    db,
    organizationId,
    siteId,
    locationId: createdPost.location_id,
    actorId: createdBy,
    eventType: 'post.created',
    entityType: 'post',
    entityId: id,
    metadata: {
      post_type: createdPost.post_type,
      status: createdPost.status,
    },
  })
  if (createdPost.status === 'published') {
    await fireSiteEventSafe({
      db,
      organizationId,
      siteId,
      locationId: createdPost.location_id,
      actorId: createdBy,
      eventType: 'post.published',
      entityType: 'post',
      entityId: id,
      metadata: {
        post_type: createdPost.post_type,
        channels: ['site'],
      },
    })
  }
  return createdPost
}

export async function updatePost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
  data: {
    title?: string; body?: string; image_asset_id?: string | null; scheduled_for?: string | null
    location_id?: string | null; post_type?: string
    slug?: string | null; seo_title?: string | null; seo_description?: string | null; og_image_asset_id?: string | null
    cta_type?: string | null; cta_url?: string | null
    event_title?: string | null; event_start?: string | null; event_end?: string | null
    offer_coupon?: string | null; offer_terms?: string | null
    gallery_media?: PostMediaInput[] | unknown
  },
  _updatedBy: string,
  env: DomainEnv,
): Promise<Post | null> {
  const existing = await queryFirst<Post>(
    db,
    `SELECT * FROM posts WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
    [postId, organizationId, siteId],
  )
  if (!existing) return null

  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const params: SqlBindValue[] = [now]
  const imageAssetId = data.image_asset_id !== undefined ? cleanString(data.image_asset_id) : undefined
  const ogImageAssetId = data.og_image_asset_id !== undefined ? cleanString(data.og_image_asset_id) : undefined
  const imageAssetChanged = imageAssetId !== undefined && imageAssetId !== existing.image_asset_id
  const ogImageAssetChanged = ogImageAssetId !== undefined && ogImageAssetId !== existing.og_image_asset_id

  if (imageAssetChanged && imageAssetId) await requireActiveMediaAsset(db, organizationId, siteId, imageAssetId, 'image_asset_id')
  if (ogImageAssetChanged && ogImageAssetId) await requireActiveMediaAsset(db, organizationId, siteId, ogImageAssetId, 'og_image_asset_id')

  if (data.slug !== undefined || !existing.slug) {
    const nextSlug = await allocatePostSlug(
      db,
      siteId,
      cleanString(data.slug) ?? cleanString(data.title) ?? existing.title ?? cleanString(data.body) ?? existing.body.slice(0, 80) ?? postId,
      postId,
    )
    sets.push('slug = ?')
    params.push(nextSlug)
  }

  const fields: Array<[string, string | null | undefined]> = [
    ['title', data.title], ['body', data.body], ['image_asset_id', imageAssetId],
    ['scheduled_for', data.scheduled_for], ['location_id', data.location_id],
    ['post_type', data.post_type], ['seo_title', data.seo_title], ['seo_description', data.seo_description],
    ['og_image_asset_id', ogImageAssetId], ['cta_type', data.cta_type], ['cta_url', data.cta_url],
    ['event_title', data.event_title], ['event_start', data.event_start], ['event_end', data.event_end],
    ['offer_coupon', data.offer_coupon], ['offer_terms', data.offer_terms],
  ]
  for (const [col, val] of fields) {
    if (val !== undefined) { sets.push(`${col} = ?`); params.push(val ?? null) }
  }

  const hasContentChange = data.title !== undefined || data.body !== undefined || data.image_asset_id !== undefined ||
    data.slug !== undefined || data.seo_title !== undefined || data.seo_description !== undefined || data.og_image_asset_id !== undefined ||
    data.gallery_media !== undefined || data.post_type !== undefined || data.cta_type !== undefined || data.cta_url !== undefined ||
    data.event_title !== undefined || data.event_start !== undefined || data.event_end !== undefined ||
    data.offer_coupon !== undefined || data.offer_terms !== undefined
  if (hasContentChange) {
    sets.push('source = ?')
    params.push('manual')
  }

  params.push(postId, organizationId, siteId)
  
  // Retry slug update on unique constraint conflict (race condition)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await execute(db, `UPDATE posts SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ?`, params)
      break
    } catch (err) {
      const message = String((err as ApiValue)?.message || err || '')
      if (message.includes('posts_site_slug_idx') || message.includes('UNIQUE constraint failed') && message.includes('slug') && (data.slug !== undefined || !existing.slug)) {
        const slugIndex = sets.findIndex(s => s.startsWith('slug = ?'))
        if (slugIndex !== -1) {
          const nextSlug = await allocatePostSlug(
            db,
            siteId,
            cleanString(data.slug) ?? cleanString(data.title) ?? existing.title ?? cleanString(data.body) ?? existing.body.slice(0, 80) ?? postId,
            postId,
          )
          params[slugIndex] = nextSlug
          continue
        }
      }
      throw err
    }
  }

  if (data.gallery_media !== undefined) {
    const galleryMedia = normalizeMediaInputs(data.gallery_media) ?? []
    const coverAssetId = data.image_asset_id !== undefined ? imageAssetId : existing.image_asset_id
    await replacePostMedia(db, organizationId, siteId, postId, coverAssetId, galleryMedia, imageAssetChanged)
  } else if (data.image_asset_id !== undefined) {
    await syncPostCoverMedia(db, organizationId, siteId, postId, imageAssetId ?? null)
  }

  return await getPost(db, organizationId, siteId, postId, env)
}

export async function publishPost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
  channels: Array<'site' | 'gmb' | 'instagram' | 'facebook'>,
  env: DomainEnv,
): Promise<PostWithChannels | null> {
  if (!channels.length) {
    throw new Error('At least one publish channel is required')
  }

  const existing = await queryFirst<Post>(
    db,
    `SELECT * FROM posts WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
    [postId, organizationId, siteId],
  )
  if (!existing) return null

  const now = new Date().toISOString()
  const slug = existing.slug ?? await allocatePostSlug(db, siteId, existing.title ?? existing.body.slice(0, 80) ?? postId, postId)

  const updateResult = await execute(
    db,
    `
    UPDATE posts SET status = 'published', slug = ?, published_at = COALESCE(published_at, ?), updated_at = ?
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `,
    [slug, now, now, postId, organizationId, siteId],
  )

  if (Number(updateResult.meta.changes ?? 0) === 0) return null

  const jobQueries = channels.map((channel) => ({
    query: `
      INSERT INTO post_channel_jobs (id, post_id, organization_id, channel, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
      ON CONFLICT DO NOTHING
    `,
    params: [crypto.randomUUID(), postId, organizationId, channel, now],
  }))
  if (jobQueries.length > 0) await executeBatch(db, jobQueries)

  await execute(
    db,
    `
    UPDATE post_channel_jobs SET status = 'published', published_at = ?
    WHERE post_id = ? AND channel = 'site'
  `,
    [now, postId],
  )
  const publishedChannels = channels.filter(channel => channel === 'site')

  const post = await getPost(db, organizationId, siteId, postId, env)
  if (post) {
    await fireSiteEventSafe({
      db,
      organizationId,
      siteId,
      locationId: post.location_id,
      eventType: 'post.published',
      entityType: 'post',
      entityId: postId,
      metadata: {
        post_type: post.post_type,
        channels: publishedChannels,
      },
    })
  }

  return post
}

export async function deletePost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
): Promise<boolean> {
  const result = await execute(
    db,
    'DELETE FROM posts WHERE id = ? AND organization_id = ? AND site_id = ?',
    [postId, organizationId, siteId],
  )
  return Number(result.meta.changes ?? 0) > 0
}

/** Public: published posts for the site, formatted for SayaPosts component. */
export async function getPublishedPosts(
  db: DbClient,
  siteId: string,
  env: DomainEnv,
  limit = 20,
  locationId?: string,
): Promise<PublishedPostSummary[]> {
  let query = `
    SELECT p.id, p.site_id, p.location_id, bl.title AS location_title, bl.slug AS location_slug,
           p.slug, p.post_type, p.title, p.body, p.image_asset_id,
           p.seo_title, p.seo_description, p.og_image_asset_id,
           p.cta_type, p.cta_url, p.event_title, p.event_start, p.event_end,
           p.offer_coupon, p.offer_terms, p.published_at, p.created_at, p.updated_at,
           ma.public_url, ma.thumbnail_url, ma.kind, ma.width, ma.height
    FROM posts p
    LEFT JOIN business_locations bl ON p.location_id = bl.id
    LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
    WHERE p.site_id = ? AND p.status = 'published'
  `
  const params: SqlBindValue[] = [siteId]
  if (locationId) {
    query += ` AND p.location_id = ?`
    params.push(locationId)
  }
  query += ` ORDER BY p.published_at DESC LIMIT ?`
  params.push(limit)
  const rows = await queryAll<PublishedPostRow>(db, query, params)
  const [origin, mediaByPost] = await Promise.all([
    resolveSitePublicOrigin(db, siteId, env),
    getPostMediaByPostIds(db, (rows ?? []).map((post) => post.id)),
  ])

  return (rows ?? []).map((row) => formatPublishedPost(row, mediaByPost.get(row.id), origin))
}

export async function getPublishedPostBySlug(
  db: DbClient,
  siteId: string,
  slugOrId: string,
  env: DomainEnv,
) {
  const row = await queryFirst<PublishedPostRow>(
    db,
    `
    SELECT p.id, p.site_id, p.location_id, bl.title AS location_title, bl.slug AS location_slug,
           p.slug, p.post_type, p.title, p.body, p.image_asset_id,
           p.seo_title, p.seo_description, p.og_image_asset_id,
           p.cta_type, p.cta_url, p.event_title, p.event_start, p.event_end,
           p.offer_coupon, p.offer_terms, p.published_at, p.created_at, p.updated_at,
           ma.public_url, ma.thumbnail_url, ma.kind, ma.width, ma.height
    FROM posts p
    LEFT JOIN business_locations bl ON p.location_id = bl.id
    LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
    WHERE p.site_id = ? AND p.status = 'published' AND (p.slug = ? OR p.id = ?)
    LIMIT 1
  `,
    [siteId, slugOrId, slugOrId],
  )
  if (!row) return null
  const [origin, mediaByPost] = await Promise.all([
    resolveSitePublicOrigin(db, siteId, env),
    getPostMediaByPostIds(db, [row.id]),
  ])
  const summary = formatPublishedPost(row, mediaByPost.get(row.id), origin)
  return {
    ...row,
    ...summary,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    og_image_asset_id: row.og_image_asset_id,
    cover: summary.media[0] ?? null,
  }
}
