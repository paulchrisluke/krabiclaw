import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { fireOrganizationEventSafe } from '~/server/utils/organization-events'
import { normalizePostSlug, postPublicPath } from '~/utils/post-slugs'
import { platformHostname, type DomainEnv } from '~/server/utils/domains'
import { buildDeleteOwnerPlacementsQuery, insertInitialMediaPlacements, hydrateMediaAssetRefs } from '~/server/utils/media-asset-manager'
import type { MediaPlacementItem } from '~/server/utils/media-placement'
import { refreshSocialCard } from '~/server/utils/social-card'
import { loadPublicSocialMedia, type PublicSocialMedia } from '~/server/utils/public-social-image'
import type { SocialImageSource } from '~/utils/social-metadata'
import {
  loadExactPublicLocalizations,
  projectExactLocalizedResource,
  projectLocalizedMediaAlt,
  resolveLocalizedRouteResourceId,
} from '~/server/utils/public-localization'
import { listPublicLocaleRepresentations } from '~/server/utils/public-locale-representations'
import { getLinkedInstagramAccount, publishToInstagram, publishToPage } from '~/server/utils/facebook-pages'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'

export { normalizePostSlug, postPublicPath }

const MAX_SLUG_ATTEMPTS = 20

export class PostValidationError extends Error {
  statusCode = 400
}

export interface PostMediaInput {
  asset_id: string
  slot: 'cover' | 'gallery'
}

export interface PublicPostMedia {
  asset_id: string
  public_url: string
  thumbnail_url: string | null
  kind: 'image' | 'video'
  slot: 'cover' | 'gallery'
  sort_order: number
  alt_text: string | null
  width: number | null
  height: number | null
}

export interface Post {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  slug: string | null
  post_type: 'standard' | 'offer' | 'event' | 'update'
  title: string | null
  body: string
  seo_title: string | null
  seo_description: string | null
  public_path?: string | null
  canonical_url?: string | null
  media?: PublicPostMedia[]
  social_image?: SocialImageSource | null
  cta_type: string | null
  cta_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon: string | null
  offer_terms: string | null
  status: 'published' | 'scheduled'
  scheduled_for: string | null
  published_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PostChannelJob {
  id: string
  post_id: string
  channel: 'instagram' | 'facebook'
  status: 'pending' | 'published' | 'failed' | 'skipped'
  provider_post_id: string | null
  error: string | null
  published_at: string | null
  created_at: string
}

export interface PostWithChannels extends Post {
  channels: PostChannelJob[]
}

export type PostPublishChannel = 'site' | 'instagram' | 'facebook'

export type PostSocialPublish =
  | { kind: 'connected'; pageToken: string; pageId: string }
  | { kind: 'unavailable'; reason: string }

type SqlBindValue = string | number | boolean | null

interface SiteUrlRow {
  public_url: string | null
  subdomain: string | null
}

interface PublishedPostSummary {
  id: string
  slug: string
  title: string
  summary: string
  published_at: string | null
  public_path: string
  canonical_url: string | null
  media: PublicPostMedia[]
  social_image: SocialImageSource | null
  cta_type: string | null
  cta_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon: string | null
  offer_terms: string | null
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
  seo_title: string | null
  seo_description: string | null
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
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

type PostWritableInput = {
  body?: string
  post_type?: string
  event_start?: string | null
  event_end?: string | null
  offer_coupon?: string | null
  offer_terms?: string | null
  scheduled_for?: string | null
}

export function validatePostInput(data: PostWritableInput, existing?: PostWritableInput) {
  const postType = data.post_type ?? existing?.post_type ?? 'standard'
  if (!['standard', 'offer', 'event', 'update'].includes(postType)) {
    throw new PostValidationError('post_type must be one of standard, offer, event, or update')
  }

  const eventStart = data.event_start !== undefined ? cleanString(data.event_start) : cleanString(existing?.event_start)
  const eventEnd = data.event_end !== undefined ? cleanString(data.event_end) : cleanString(existing?.event_end)
  if (postType === 'event') {
    if (!eventStart) throw new PostValidationError('event_start is required when post_type is "event"')
    const startTime = Date.parse(eventStart)
    if (!Number.isFinite(startTime)) throw new PostValidationError('event_start must be a valid ISO 8601 datetime')
    if (eventEnd) {
      const endTime = Date.parse(eventEnd)
      if (!Number.isFinite(endTime)) throw new PostValidationError('event_end must be a valid ISO 8601 datetime')
      if (endTime <= startTime) throw new PostValidationError('event_end must be later than event_start')
    }
  }

  if (postType === 'offer') {
    const coupon = data.offer_coupon !== undefined ? cleanString(data.offer_coupon) : cleanString(existing?.offer_coupon)
    const terms = data.offer_terms !== undefined ? cleanString(data.offer_terms) : cleanString(existing?.offer_terms)
    if (!coupon && !terms) {
      throw new PostValidationError('offer_coupon or offer_terms is required when post_type is "offer"')
    }
  }

  if (data.scheduled_for) {
    const scheduledTime = Date.parse(data.scheduled_for)
    if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
      throw new PostValidationError('scheduled_for must be a future ISO 8601 datetime')
    }
  }
}

function normalizeMediaInputs(value: unknown): PostMediaInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new PostValidationError('media must be an array')
  const media = value.map((item): PostMediaInput => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new PostValidationError('media items must contain asset_id and slot')
    }
    const record = item as Record<string, unknown>
    const mediaAssetId = cleanString(record.asset_id)
    if (!mediaAssetId) throw new PostValidationError('media items must contain asset_id')
    const slot = record.slot === 'cover' ? 'cover' : record.slot === 'gallery' ? 'gallery' : null
    if (!slot) throw new PostValidationError('media items must use cover or gallery slot')
    return { asset_id: mediaAssetId, slot }
  })
  if (media.filter(item => item.slot === 'cover').length > 1) {
    throw new PostValidationError('media accepts at most one cover asset')
  }
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
  return subdomain ? `https://${subdomain}.${platformHostname(env)}` : null
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

function postMediaPlacementQueries(
  organizationId: string,
  siteId: string,
  postId: string,
  mediaInput: PostMediaInput[],
) {
  const now = new Date().toISOString()
  const cover = mediaInput.find(item => item.slot === 'cover')
  const gallery = mediaInput.filter(item => item.slot === 'gallery')

  return [
    ...insertInitialMediaPlacements({
      organizationId, siteId,
      placement: { owner_type: 'post', owner_id: postId, slot: 'cover' },
      media: cover ? [{ asset_id: cover.asset_id }] : [],
      now,
    }),
    ...insertInitialMediaPlacements({
      organizationId, siteId,
      placement: { owner_type: 'post', owner_id: postId, slot: 'gallery' },
      media: gallery.map(item => ({ asset_id: item.asset_id })),
      now,
    }),
  ]
}

async function getPostMediaByPostIds(db: DbClient, siteId: string, postIds: string[]) {
  return await loadPublicSocialMedia(db, siteId, 'post', postIds)
}

function publicMediaFromRows(rows: MediaPlacementItem[] | undefined): PublicPostMedia[] {
  return (rows ?? [])
    .filter((row) => row.public_url && (row.kind === 'image' || row.kind === 'video'))
    .map((row) => ({
      asset_id: row.asset_id,
      public_url: row.public_url!,
      thumbnail_url: row.thumbnail_url,
      kind: row.kind === 'video' ? 'video' as const : 'image' as const,
      slot: row.slot === 'cover' ? row.slot : 'gallery',
      sort_order: row.sort_order,
      alt_text: row.alt_text,
      width: row.width ?? null,
      height: row.height ?? null,
    }))
}

function attachPostPublicFields<T extends Post>(
  post: T,
  socialMedia: PublicSocialMedia | undefined,
  origin: string | null,
): T {
  const slug = post.slug ?? post.id
  const publicPath = postPublicPath(slug)
  const media = publicMediaFromRows(socialMedia?.media)
  return {
    ...post,
    slug,
    public_path: publicPath,
    canonical_url: absoluteUrl(origin, publicPath),
    media,
    social_image: socialMedia?.social_image ?? null,
  }
}

function formatPublishedPost(row: PublishedPostRow, socialMedia: PublicSocialMedia | undefined, origin: string | null): PublishedPostSummary {
  const slug = row.slug ?? row.id
  const publicPath = postPublicPath(slug)
  const media = publicMediaFromRows(socialMedia?.media)
  return {
    id: row.id,
    slug,
    title: row.title ?? '',
    summary: row.body,
    published_at: row.published_at ?? row.created_at,
    public_path: publicPath,
    canonical_url: absoluteUrl(origin, publicPath),
    media,
    social_image: socialMedia?.social_image ?? null,
    cta_type: row.cta_type,
    cta_url: row.cta_url,
    event_title: row.event_title,
    event_start: row.event_start,
    event_end: row.event_end,
    offer_coupon: row.offer_coupon,
    offer_terms: row.offer_terms,
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
  if (status && status !== 'published' && status !== 'scheduled') {
    throw new PostValidationError('status must be published or scheduled')
  }
  let query = `
    SELECT p.*
    FROM posts p
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
  const mediaByPost = await getPostMediaByPostIds(db, siteId, (results ?? []).map((post) => post.id))
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
    SELECT p.*
    FROM posts p
    WHERE p.id = ? AND p.organization_id = ? AND p.site_id = ?
    LIMIT 1
  `,
    [postId, organizationId, siteId],
  )
  if (!post) return null

  const [jobs, origin, mediaByPost] = await Promise.all([
    queryAll<PostChannelJob>(db, `SELECT * FROM post_channel_jobs WHERE post_id = ? ORDER BY channel`, [postId]),
    resolveSitePublicOrigin(db, siteId, env),
    getPostMediaByPostIds(db, siteId, [postId]),
  ])

  return { ...attachPostPublicFields(post, mediaByPost.get(post.id), origin), channels: jobs ?? [] }
}

export async function createPost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  data: {
    title?: string; body: string; scheduled_for?: string
    location_id?: string; post_type?: string
    slug?: string | null; seo_title?: string | null; seo_description?: string | null
    cta_type?: string; cta_url?: string
    event_title?: string; event_start?: string; event_end?: string
    offer_coupon?: string; offer_terms?: string
    media?: PostMediaInput[] | unknown
  },
  createdBy: string,
  env: DomainEnv,
): Promise<Post> {
  validatePostInput(data)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const status = data.scheduled_for ? 'scheduled' : 'published'
  const publishedAt = status === 'published' ? now : null
  const title = cleanString(data.title)
  const body = data.body.trim()
  let slug = await allocatePostSlug(db, siteId, cleanString(data.slug) ?? title ?? body.slice(0, 80) ?? id)
  const media = normalizeMediaInputs(data.media) ?? []
  await hydrateMediaAssetRefs(db, {
    organizationId,
    siteId,
    refs: media.map(item => ({ asset_id: item.asset_id })),
    allowedKinds: ['image', 'video'],
    fieldName: 'media',
  })

  // Retry slug allocation on unique constraint conflict (race condition)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await executeBatch(db, [{
        query: `
        INSERT INTO posts (id, organization_id, site_id, location_id, slug, post_type, title, body,
          seo_title, seo_description,
          cta_type, cta_url, event_title, event_start, event_end, offer_coupon, offer_terms,
          status, scheduled_for, published_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        params: [
          id, organizationId, siteId,
          data.location_id ?? null, slug, data.post_type ?? 'standard',
          title, body,
          cleanString(data.seo_title), cleanString(data.seo_description),
          data.cta_type ?? null, data.cta_url ?? null,
          data.event_title ?? null, data.event_start ?? null, data.event_end ?? null,
          data.offer_coupon ?? null, data.offer_terms ?? null,
          status, data.scheduled_for ?? null, publishedAt, createdBy, now, now,
        ],
      }, ...postMediaPlacementQueries(organizationId, siteId, id, media)])
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

  const createdPost = await getPost(db, organizationId, siteId, id, env)
  if (!createdPost) throw new Error('Post not found after creation')
  await fireOrganizationEventSafe({
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
    await fireOrganizationEventSafe({
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
  await refreshSocialCard({ db, env, owner: { owner_type: 'post', owner_id: id }, actorId: createdBy })
  return createdPost
}

export async function updatePost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
  data: {
    title?: string; body?: string; scheduled_for?: string | null
    location_id?: string | null; post_type?: string
    slug?: string | null; seo_title?: string | null; seo_description?: string | null
    cta_type?: string | null; cta_url?: string | null
    event_title?: string | null; event_start?: string | null; event_end?: string | null
    offer_coupon?: string | null; offer_terms?: string | null
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

  validatePostInput(data, existing)

  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const params: SqlBindValue[] = [now]

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
    ['title', data.title], ['body', data.body],
    ['scheduled_for', data.scheduled_for], ['location_id', data.location_id],
    ['post_type', data.post_type], ['seo_title', data.seo_title], ['seo_description', data.seo_description],
    ['cta_type', data.cta_type], ['cta_url', data.cta_url],
    ['event_title', data.event_title], ['event_start', data.event_start], ['event_end', data.event_end],
    ['offer_coupon', data.offer_coupon], ['offer_terms', data.offer_terms],
  ]
  for (const [col, val] of fields) {
    if (val !== undefined) { sets.push(`${col} = ?`); params.push(val ?? null) }
  }
  if (data.scheduled_for !== undefined) {
    if (data.scheduled_for) {
      sets.push("status = 'scheduled'", 'published_at = NULL')
    } else if (existing.status === 'scheduled') {
      sets.push("status = 'published'", 'published_at = ?')
      params.push(now)
    }
  }

  const hasContentChange = data.title !== undefined || data.body !== undefined ||
    data.slug !== undefined || data.seo_title !== undefined || data.seo_description !== undefined ||
    data.post_type !== undefined || data.cta_type !== undefined || data.cta_url !== undefined ||
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
      await executeBatch(db, [{
        query: `UPDATE posts SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ?`,
        params,
      }])
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

  const updated = await getPost(db, organizationId, siteId, postId, env)
  await refreshSocialCard({ db, env, owner: { owner_type: 'post', owner_id: postId }, actorId: _updatedBy })
  return updated
}

export async function publishPost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
  channels: PostPublishChannel[],
  env: DomainEnv,
  socialPublish: PostSocialPublish | null,
): Promise<PostWithChannels | null> {
  if (!channels.length) {
    throw new Error('At least one publish channel is required')
  }
  const socialChannels = channels.filter((channel): channel is PostChannelJob['channel'] =>
    channel === 'facebook' || channel === 'instagram',
  )
  if (socialChannels.length > 0 && !socialPublish) {
    throw new Error('Social publish capability is required for external channels')
  }

  const existing = await queryFirst<Post>(
    db,
    `SELECT * FROM posts WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
    [postId, organizationId, siteId],
  )
  if (!existing) return null

  const now = new Date().toISOString()
  const slug = existing.slug ?? await allocatePostSlug(db, siteId, existing.title ?? existing.body.slice(0, 80) ?? postId, postId)

  if (channels.includes('site')) {
    const updateResult = await execute(
      db,
      `UPDATE posts
          SET status = 'published', slug = ?, scheduled_for = NULL,
              published_at = COALESCE(published_at, ?), updated_at = ?
        WHERE id = ? AND organization_id = ? AND site_id = ?`,
      [slug, now, now, postId, organizationId, siteId],
    )
    if (Number(updateResult.meta.changes ?? 0) === 0) return null
  }

  const publishedChannels = channels.filter(channel => channel === 'site')

  const post = await getPost(db, organizationId, siteId, postId, env)
  if (post && channels.includes('site') && existing.status !== 'published') {
    await fireOrganizationEventSafe({
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

  if (!post) return null

  await refreshSocialCard({ db, env, owner: { owner_type: 'post', owner_id: postId } })

  const socialCapability = socialPublish
  for (const channel of socialChannels) {
    if (!(await claimPostChannelJob(db, postId, channel, now))) continue

    if (socialCapability?.kind === 'unavailable') {
      await settlePostChannelJob(db, postId, channel, { kind: 'skipped', reason: socialCapability.reason })
      continue
    }

    if (!socialCapability) throw new Error('Social publish capability is required for external channels')
    await publishPostChannel(db, postId, channel, post, socialCapability)
  }

  return await getPost(db, organizationId, siteId, postId, env)
}

async function claimPostChannelJob(
  db: DbClient,
  postId: string,
  channel: PostChannelJob['channel'],
  now: string,
): Promise<boolean> {
  const inserted = await execute(db, `
    INSERT OR IGNORE INTO post_channel_jobs (id, post_id, channel, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `, [crypto.randomUUID(), postId, channel, now])
  if (Number(inserted.meta?.changes ?? 0) === 1) return true

  const reclaimed = await execute(db, `
    UPDATE post_channel_jobs
       SET status = 'pending', provider_post_id = NULL, error = NULL, published_at = NULL
     WHERE post_id = ? AND channel = ? AND status = 'skipped'
  `, [postId, channel])
  return Number(reclaimed.meta?.changes ?? 0) === 1
}

type PostChannelJobOutcome =
  | { kind: 'published'; providerPostId: string }
  | { kind: 'failed' | 'skipped'; reason: string }

async function settlePostChannelJob(
  db: DbClient,
  postId: string,
  channel: PostChannelJob['channel'],
  outcome: PostChannelJobOutcome,
) {
  const now = new Date().toISOString()
  if (outcome.kind === 'published') {
    await execute(db, `
      UPDATE post_channel_jobs
         SET status = 'published', provider_post_id = ?, error = NULL, published_at = ?
       WHERE post_id = ? AND channel = ? AND status = 'pending'
    `, [outcome.providerPostId, now, postId, channel])
    return
  }
  await execute(db, `
    UPDATE post_channel_jobs
       SET status = ?, provider_post_id = NULL, error = ?, published_at = NULL
     WHERE post_id = ? AND channel = ? AND status = 'pending'
  `, [outcome.kind, outcome.reason, postId, channel])
}

async function publishPostChannel(
  db: DbClient,
  postId: string,
  channel: PostChannelJob['channel'],
  post: PostWithChannels,
  socialPublish: Extract<PostSocialPublish, { kind: 'connected' }>,
) {
  if (channel === 'facebook') {
    let providerPostId: string
    try {
      const result = await publishToPage(socialPublish.pageToken, socialPublish.pageId, { message: post.body })
      providerPostId = result.id
    } catch (error) {
      await settlePostChannelJob(db, postId, channel, {
        kind: 'failed',
        reason: error instanceof Error ? error.message : 'facebook publish failed',
      })
      return
    }
    await settlePostChannelJob(db, postId, channel, { kind: 'published', providerPostId })
    return
  }

  const imageUrl = post.media?.find(item => item.slot === 'cover' && item.kind === 'image')?.public_url
  if (!imageUrl) {
    await settlePostChannelJob(db, postId, channel, {
      kind: 'skipped',
      reason: 'Instagram requires an image. Add a photo to this post.',
    })
    return
  }

  let instagramAccountId: string | null
  try {
    instagramAccountId = await getLinkedInstagramAccount(socialPublish.pageToken, socialPublish.pageId)
  } catch (error) {
    await settlePostChannelJob(db, postId, channel, {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'instagram account lookup failed',
    })
    return
  }
  if (!instagramAccountId) {
    await settlePostChannelJob(db, postId, channel, {
      kind: 'skipped',
      reason: 'No Instagram Business account is linked to this Facebook Page.',
    })
    return
  }

  let providerPostId: string
  try {
    const result = await publishToInstagram(socialPublish.pageToken, instagramAccountId, {
      caption: post.body,
      imageUrl,
    })
    providerPostId = result.id
  } catch (error) {
    await settlePostChannelJob(db, postId, channel, {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'instagram publish failed',
    })
    return
  }
  await settlePostChannelJob(db, postId, channel, { kind: 'published', providerPostId })
}

interface DuePostRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  post_type: Post['post_type']
  scheduled_for: string
  updated_at: string
}

export async function publishDuePosts(db: DbClient, now = new Date()) {
  const nowIso = now.toISOString()
  const due = await queryAll<DuePostRow>(db, `
    SELECT id, organization_id, site_id, location_id, post_type, scheduled_for, updated_at
      FROM posts
     WHERE status = 'scheduled' AND julianday(scheduled_for) <= julianday(?)
     ORDER BY julianday(scheduled_for) ASC, id ASC
     LIMIT 100
  `, [nowIso])
  let published = 0
  for (const post of due) {
    const previousUpdatedAt = Date.parse(post.updated_at)
    if (!Number.isFinite(previousUpdatedAt)) throw new Error(`Scheduled post ${post.id} has an invalid updated_at`)
    const updatedAt = new Date(Math.max(now.getTime(), previousUpdatedAt + 1)).toISOString()
    const results = await executeBatch(db, [
      {
        query: `
          UPDATE posts
             SET status = 'published', scheduled_for = NULL,
                 published_at = COALESCE(published_at, scheduled_for, ?), updated_at = ?
           WHERE id = ? AND status = 'scheduled' AND scheduled_for = ? AND julianday(scheduled_for) <= julianday(?) AND updated_at = ?
        `,
        params: [nowIso, updatedAt, post.id, post.scheduled_for, nowIso, post.updated_at],
      },
      publicResourceCacheInvalidationQuery(post.site_id, 'post-scheduled-publish'),
    ])
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) continue
    published += 1
    await fireOrganizationEventSafe({
      db,
      organizationId: post.organization_id,
      siteId: post.site_id,
      locationId: post.location_id,
      eventType: 'post.published',
      entityType: 'post',
      entityId: post.id,
      metadata: { post_type: post.post_type, channels: ['site'] },
    })
  }
  return { published }
}

export async function deletePost(
  db: DbClient,
  organizationId: string,
  siteId: string,
  postId: string,
): Promise<boolean> {
  const [, deleteResult] = await executeBatch(db, [
    buildDeleteOwnerPlacementsQuery({ ownerType: 'post', ownerId: postId, organizationId, siteId }),
    {
      query: 'DELETE FROM posts WHERE id = ? AND organization_id = ? AND site_id = ?',
      params: [postId, organizationId, siteId],
    },
  ])
  return Number(deleteResult?.meta.changes ?? 0) > 0
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
           p.slug, p.post_type, p.title, p.body,
           p.seo_title, p.seo_description,
           p.cta_type, p.cta_url, p.event_title, p.event_start, p.event_end,
           p.offer_coupon, p.offer_terms, p.published_at, p.created_at, p.updated_at
    FROM posts p
    LEFT JOIN business_locations bl ON p.location_id = bl.id
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
    getPostMediaByPostIds(db, siteId, (rows ?? []).map((post) => post.id)),
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
           p.slug, p.post_type, p.title, p.body,
           p.seo_title, p.seo_description,
           p.cta_type, p.cta_url, p.event_title, p.event_start, p.event_end,
           p.offer_coupon, p.offer_terms, p.published_at, p.created_at, p.updated_at
    FROM posts p
    LEFT JOIN business_locations bl ON p.location_id = bl.id
    WHERE p.site_id = ? AND p.status = 'published' AND (p.slug = ? OR p.id = ?)
    LIMIT 1
  `,
    [siteId, slugOrId, slugOrId],
  )
  if (!row) return null
  const [origin, mediaByPost] = await Promise.all([
    resolveSitePublicOrigin(db, siteId, env),
    getPostMediaByPostIds(db, siteId, [row.id]),
  ])
  const summary = formatPublishedPost(row, mediaByPost.get(row.id), origin)
  return {
    ...row,
    ...summary,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
  }
}

export async function getPublishedPostByPublicRoute(
  db: DbClient,
  siteId: string,
  slug: string,
  locale: string,
  env: DomainEnv,
) {
  const site = await queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM sites WHERE id = ? AND status = \'active\' LIMIT 1', [siteId])
  if (!site) return null

  let resourceId = slug
  let localizations = [] as Awaited<ReturnType<typeof loadExactPublicLocalizations>>
  if (locale !== 'en') {
    localizations = await loadExactPublicLocalizations(db, site.organization_id, siteId, locale)
    const routeResourceId = resolveLocalizedRouteResourceId(localizations, 'site_post', `/${locale}/posts/${slug}`)
    if (!routeResourceId) return null
    resourceId = routeResourceId
  }

  const sourcePost = await getPublishedPostBySlug(db, siteId, resourceId, env)
  if (!sourcePost) return null
  let post = sourcePost
  if (locale !== 'en') {
    const postLocalization = localizations.find(item => item.resourceType === 'site_post' && item.resourceId === sourcePost.id)
    if (!postLocalization) return null
    post = {
      ...projectExactLocalizedResource('site_post', sourcePost, postLocalization),
      media: projectLocalizedMediaAlt(sourcePost.media, localizations),
    }
  }

  const localeRepresentations = await listPublicLocaleRepresentations(db, {
    organizationId: site.organization_id,
    siteId,
    sourcePath: sourcePost.public_path,
    sourceLabel: 'English',
    resource: { type: 'site_post', id: sourcePost.id },
  })
  return { ...post, localeRepresentations }
}
