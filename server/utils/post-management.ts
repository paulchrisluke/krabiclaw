import { createContentDocumentWithBlocks, prepareContentDocumentDeletion, updateContentDocument, type ContentDocumentChanges } from '~/server/utils/content/documents'
import { parsePostInput, parsePostTopic, PostValidationError, type PostTopic } from '~/shared/posts'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { fireOrganizationEventSafe } from '~/server/utils/organization-events'
import { normalizePostSlug, postPublicPath } from '~/utils/post-slugs'
import type { DomainEnv } from '~/server/utils/domains'
import { insertInitialMediaPlacements, hydrateMediaAssetRefs } from '~/server/utils/media-asset-manager'
import type { MediaPlacementItem } from '~/server/utils/media-placement'
import { refreshSocialCard } from '~/server/utils/social-card'
import { loadPublicSocialMedia, type PublicSocialMedia } from '~/server/utils/public-social-image'
import type { SocialImageSource } from '~/utils/social-metadata'
import {
  loadExactPublicLocalizations,
  projectLocalizedMediaAlt,
} from '~/server/utils/public-localization'
import { listPublicLocaleRepresentations } from '~/server/utils/public-locale-representations'
import { getLinkedInstagramAccount, publishToInstagram, publishToPage } from '~/server/utils/facebook-pages'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'

export { normalizePostSlug, postPublicPath }

const MAX_SLUG_ATTEMPTS = 20

export { PostValidationError }

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

export type Post = PostTopic & {
  id: string
  organization_id: string
  location_id: string | null
  slug: string | null
  title: string | null
  body: string
  seo_title: string | null
  seo_description: string | null
  public_path?: string | null
  canonical_url?: string | null
  media?: PublicPostMedia[]
  social_image?: SocialImageSource | null
  location_phone: string | null
  status: 'draft' | 'published' | 'scheduled'
  visibility: 'public' | 'unlisted'
  scheduled_for: string | null
  published_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PostChannelState {
  channel: 'instagram' | 'facebook'
  status: 'pending' | 'published' | 'failed' | 'skipped'
  provider_post_id: string | null
  error: string | null
  published_at: string | null
  created_at: string
}

export type PostWithChannels = Post & {
  channels: PostChannelState[]
}

export type PostPublishChannel = 'site' | 'instagram' | 'facebook'

export type PostSocialPublish =
  | { kind: 'connected'; pageToken: string; pageId: string }
  | { kind: 'unavailable'; reason: string }

type SqlBindValue = string | number | boolean | null

export type PublishedPostSummary = PostTopic & {
  id: string
  slug: string
  title: string
  summary: string
  published_at: string | null
  public_path: string
  canonical_url: string | null
  media: PublicPostMedia[]
  social_image: SocialImageSource | null
  location_phone: string | null
  location?: { id: string; title: string | null; slug: string | null } | null
}

interface PublishedPostRow {
  id: string
  organization_id: string
  location_id: string | null
  location_title: string | null
  location_slug: string | null
  slug: string | null
  title: string | null
  body: string
  seo_title: string | null
  seo_description: string | null
  post_type: PostTopic['post_type']
  event: string | null
  offer: string | null
  call_to_action: string | null
  alert_type: string | null
  location_phone: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

async function validatePostLocation(db: DbClient, organizationId: string, locationId: string | null, post: PostTopic) {
  const location = locationId ? await queryFirst<{ phone: string | null }>(db, 'SELECT phone FROM business_locations WHERE id = ? AND organization_id = ? AND organization_id = ?', [locationId, organizationId]) : null
  if (locationId && !location) throw new PostValidationError('location_id must belong to this site')
  if (post.call_to_action?.action_type === 'call' && !location?.phone) throw new PostValidationError('CALL requires a location with a phone number')
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function absoluteUrl(origin: string | null, path: string) {
  if (!origin) return null
  return new URL(path, origin.endsWith('/') ? origin : `${origin}/`).toString()
}

async function resolveSitePublicOrigin(db: DbClient, organizationId: string) {
  const domain = await queryFirst<{ domain: string }>(db,
    "SELECT domain FROM organization_domains WHERE organization_id = ? AND role = 'canonical' AND status = 'active'", [organizationId])
  return domain ? `https://${domain.domain}` : null
}

async function allocatePostSlug(db: DbClient, organizationId: string, source: string, excludePostId?: string) {
  const base = normalizePostSlug(source)
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const existing = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM content_documents WHERE kind = 'social_post' AND row_role = 'root' AND organization_id = ? AND slug = ? ${excludePostId ? 'AND id != ?' : ''} LIMIT 1`,
      excludePostId ? [organizationId, slug, excludePostId] : [organizationId, slug],
    )
    if (!existing) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function postMediaPlacementQueries(
  organizationId: string,
  postId: string,
  mediaInput: PostMediaInput[],
) {
  const now = new Date().toISOString()
  const cover = mediaInput.find(item => item.slot === 'cover')
  const gallery = mediaInput.filter(item => item.slot === 'gallery')

  return [
    ...insertInitialMediaPlacements({
      organizationId, 
      placement: { owner_type: 'content_document', owner_id: postId, slot: 'cover' },
      media: cover ? [{ asset_id: cover.asset_id }] : [],
      now,
    }),
    ...insertInitialMediaPlacements({
      organizationId, 
      placement: { owner_type: 'content_document', owner_id: postId, slot: 'gallery' },
      media: gallery.map(item => ({ asset_id: item.asset_id })),
      now,
    }),
  ]
}

async function getPostMediaByPostIds(db: DbClient, organizationId: string, postIds: string[]) {
  return await loadPublicSocialMedia(db, organizationId, 'content_document', postIds)
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

type PostRow = Omit<Post, keyof PostTopic> & Pick<PublishedPostRow, keyof PostTopic>

function topicFields(post: PostTopic): PostTopic {
  return parsePostTopic({ post_type: post.post_type, event: post.event, offer: post.offer, call_to_action: post.call_to_action, alert_type: post.alert_type })
}

function parsePostRow<T extends Pick<PublishedPostRow, keyof PostTopic>>(row: T) {
  const topic = parsePostTopic({ post_type: row.post_type, event: row.event === null ? null : JSON.parse(row.event), offer: row.offer === null ? null : JSON.parse(row.offer), call_to_action: row.call_to_action === null ? null : JSON.parse(row.call_to_action), alert_type: row.alert_type })
  return { ...row, ...topic }
}

function attachPostPublicFields(
  row: PostRow,
  socialMedia: PublicSocialMedia | undefined,
  origin: string | null,
): Post {
  const post = parsePostRow(row)
  // A post's public path is its slug. `?? post.id` published the row id as the
  // URL whenever the slug was missing, which is how demo serves
  // /posts/post-demo-1 while its Thai translation announces
  // /posts/margherita-monday: two different addresses for one post, and the
  // English one a database id. publishPost allocates the slug, so a published
  // post without one is a broken row, not a case to cover for.
  if (post.status === 'published' && !post.slug) {
    throw new Error(`Published post ${post.id} has no slug`)
  }
  const publicPath = post.slug ? postPublicPath(post.slug) : null
  const media = publicMediaFromRows(socialMedia?.media)
  return {
    ...post,
    public_path: post.status === 'published' ? publicPath : null,
    canonical_url: post.status === 'published' && publicPath ? absoluteUrl(origin, publicPath) : null,
    media,
    social_image: socialMedia?.social_image ?? null,
  }
}

function formatPublishedPost(row: PublishedPostRow, socialMedia: PublicSocialMedia | undefined, origin: string | null, locale = 'en'): PublishedPostSummary {
  // Every row reaching here is published (the query filters on it), so the
  // slug is not optional — see attachPostPublicFields above.
  if (!row.slug) throw new Error(`Published post ${row.id} has no slug`)
  const slug = row.slug
  const publicPath = (locale === 'en' ? '' : '/' + locale) + postPublicPath(slug)
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
    ...topicFields(parsePostRow(row)),
    location_phone: row.location_phone,
    location: row.location_id
      ? { id: row.location_id, title: row.location_title, slug: row.location_slug }
      : null,
  }
}

export async function listPosts(
  db: DbClient,
  organizationId: string,
  status?: string,
  locationId?: string,
): Promise<Post[]> {
  if (status && status !== 'draft' && status !== 'published' && status !== 'scheduled') {
    throw new PostValidationError('status must be draft, published or scheduled')
  }
  let query = `
    SELECT p.id, p.organization_id, p.organization_id, p.location_id, p.slug, p.title, p.seo_title, p.seo_description, p.status, p.visibility, p.scheduled_for, p.published_at, p.created_by, p.created_at, p.updated_at, p.summary AS body, (p.metadata_json ->> '$.post_type') AS post_type, json_extract(p.metadata_json, '$.event') AS event, json_extract(p.metadata_json, '$.offer') AS offer, json_extract(p.metadata_json, '$.call_to_action') AS call_to_action, (p.metadata_json ->> '$.alert_type') AS alert_type, bl.phone AS location_phone
    FROM content_documents p LEFT JOIN business_locations bl ON bl.id = p.location_id AND bl.organization_id = p.organization_id
    WHERE p.kind = 'social_post' AND p.row_role = 'root' AND p.organization_id = ? AND p.organization_id = ?
  `
  const params: string[] = [organizationId]
  if (status) {
    query += ` AND p.status = ?`
    params.push(status)
  }
  if (locationId) {
    query += ` AND p.location_id = ?`
    params.push(locationId)
  }
  query += ` ORDER BY p.updated_at DESC LIMIT 100`
  const results = await queryAll<PostRow>(db, query, params)
  const origin = await resolveSitePublicOrigin(db, organizationId)
  const mediaByPost = await getPostMediaByPostIds(db, organizationId, (results ?? []).map((post) => post.id))
  return (results ?? []).map((post) => attachPostPublicFields(post, mediaByPost.get(post.id), origin))
}

export async function getPost(
  db: DbClient,
  organizationId: string,
  postId: string,
): Promise<PostWithChannels | null> {
  const post = await queryFirst<PostRow>(
    db,
    `
    SELECT p.id, p.organization_id, p.organization_id, p.location_id, p.slug, p.title, p.seo_title, p.seo_description, p.status, p.visibility, p.scheduled_for, p.published_at, p.created_by, p.created_at, p.updated_at, p.summary AS body, (p.metadata_json ->> '$.post_type') AS post_type, json_extract(p.metadata_json, '$.event') AS event, json_extract(p.metadata_json, '$.offer') AS offer, json_extract(p.metadata_json, '$.call_to_action') AS call_to_action, (p.metadata_json ->> '$.alert_type') AS alert_type, bl.phone AS location_phone
    FROM content_documents p LEFT JOIN business_locations bl ON bl.id = p.location_id AND bl.organization_id = p.organization_id
    WHERE p.kind = 'social_post' AND p.row_role = 'root' AND p.id = ? AND p.organization_id = ? 
    LIMIT 1
  `,
    [postId, organizationId],
  )
  if (!post) return null

  const [jobs, origin, mediaByPost] = await Promise.all([
    queryAll<PostChannelState>(db, `SELECT c.key AS channel,
      c.value ->> '$.status' AS status, c.value ->> '$.provider_post_id' AS provider_post_id,
      c.value ->> '$.error_message' AS error, c.value ->> '$.published_at' AS published_at, c.value ->> '$.created_at' AS created_at
      FROM content_documents d, json_each(d.metadata_json, '$.channels') c
      WHERE d.id = ? AND d.kind = 'social_post' AND d.row_role = 'root' ORDER BY c.key`, [postId]),
    resolveSitePublicOrigin(db, organizationId),
    getPostMediaByPostIds(db, organizationId, [postId]),
  ])

  return { ...attachPostPublicFields(post, mediaByPost.get(post.id), origin), channels: jobs ?? [] }
}

export async function createPost(
  db: DbClient,
  organizationId: string,
  input: unknown,
  createdBy: string,
  env: DomainEnv,
): Promise<Post> {
  const data = parsePostInput(input)
  await validatePostLocation(db, organizationId, data.location_id ?? null, data)
  const id = crypto.randomUUID()
  const status = data.scheduled_for ? 'scheduled' : 'draft'
  const title = cleanString(data.title)
  const body = data.body.trim()
  let slug = await allocatePostSlug(db, organizationId, cleanString(data.slug) ?? title ?? body.slice(0, 80) ?? id)
  const media = data.media ?? []
  await hydrateMediaAssetRefs(db, {
    organizationId,
    
    refs: media.map(item => ({ asset_id: item.asset_id })),
    allowedKinds: ['image', 'video'],
    fieldName: 'media',
  })

  // Retry slug allocation on unique constraint conflict (race condition)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await createContentDocumentWithBlocks(db, {
        id, rowRole: 'root', kind: 'social_post', locale: 'en', organizationId, 
        locationId: data.location_id ?? null, slug, title, summary: body,
        seoTitle: cleanString(data.seo_title), seoDescription: cleanString(data.seo_description),
        status, visibility: data.visibility ?? 'public', source: 'manual', scheduledFor: data.scheduled_for ?? null, createdBy,
        metadata: { post_type: data.post_type, call_to_action: data.call_to_action, event: data.event,
          offer: data.offer, alert_type: data.alert_type, channels: {} },
      }, [], { additionalQueriesAfter: postMediaPlacementQueries(organizationId, id, media) })

      break
    } catch (err) {
      const message = String((err as ApiValue)?.message || err || '')
      if (message.includes('UNIQUE constraint failed') && message.includes('content_documents.slug')) {
        slug = await allocatePostSlug(db, organizationId, cleanString(data.slug) ?? title ?? body.slice(0, 80) ?? id)
        continue
      }
      throw err
    }
  }

  const createdPost = await getPost(db, organizationId, id)
  if (!createdPost) throw new Error('Post not found after creation')
  await fireOrganizationEventSafe({
    db,
    organizationId,
    
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
  await refreshSocialCard({ db, env, owner: { owner_type: 'content_document', owner_id: id }, actorId: createdBy })
  return createdPost
}

export async function updatePost(
  db: DbClient,
  organizationId: string,
  postId: string,
  input: unknown,
  _updatedBy: string,
  env: DomainEnv,
): Promise<Post | null> {
  const row = await queryFirst<PostRow>(
    db,
    `SELECT id, organization_id, organization_id, location_id, slug, title, seo_title, seo_description, status, visibility, scheduled_for, published_at, created_by, created_at, updated_at, summary AS body, (metadata_json ->> '$.post_type') AS post_type, json_extract(metadata_json, '$.event') AS event, json_extract(metadata_json, '$.offer') AS offer, json_extract(metadata_json, '$.call_to_action') AS call_to_action, (metadata_json ->> '$.alert_type') AS alert_type, NULL AS location_phone FROM content_documents WHERE kind = 'social_post' AND row_role = 'root' AND id = ? AND organization_id = ?  LIMIT 1`,
    [postId, organizationId],
  )
  if (!row) return null
  const existing = parsePostRow(row)
  const data = parsePostInput(input, existing)
  if (data.media !== undefined) throw new PostValidationError('Update post media through media placements')
  await validatePostLocation(db, organizationId, data.location_id === undefined ? existing.location_id : data.location_id, data)
  if (data.post_type === 'alert' && (await getPostMediaByPostIds(db, organizationId, [postId])).get(postId)?.media.length) throw new PostValidationError('Remove post media before changing the topic to alert')

  const now = new Date().toISOString()
  const changes: ContentDocumentChanges = {
    title: data.title, summary: data.body, seo_title: data.seo_title, seo_description: data.seo_description,
    scheduled_for: data.scheduled_for, visibility: data.visibility, location_id: data.location_id, updated_by: _updatedBy,
    metadata: { post_type: data.post_type, call_to_action: data.call_to_action, event: data.event,
      offer: data.offer, alert_type: data.alert_type },
  }
  const allocateSlug = data.slug !== undefined || !existing.slug
  const slugSource = cleanString(data.slug) ?? cleanString(data.title) ?? existing.title ?? cleanString(data.body) ?? existing.body.slice(0, 80)
  if (allocateSlug) changes.slug = await allocatePostSlug(db, organizationId, slugSource, postId)
  if (data.scheduled_for !== undefined && data.scheduled_for !== existing.scheduled_for) {
    if (existing.status === 'published') throw new PostValidationError('Published posts cannot be rescheduled; use visibility to make the post unlisted')
    if (data.scheduled_for) changes.status = 'scheduled'
    else if (existing.status === 'scheduled') throw new PostValidationError('Use publish_post to publish a scheduled post; scheduled_for cannot be cleared')
  }
  if (data.title !== undefined || data.body !== undefined || data.slug !== undefined || data.seo_title !== undefined || data.seo_description !== undefined || data.post_type !== undefined) changes.source = 'manual'
  for (let attempt = 0; ; attempt++) {
    try {
      await updateContentDocument(db, postId, { expected_updated_at: row.updated_at, changes,
        additionalQueriesAfter: data.visibility === undefined ? [] : [publicResourceCacheInvalidationQuery(organizationId, 'post-visibility')],
        additionalQueriesBefore: data.post_type === 'alert' ? [{
          query: `INSERT INTO content_blocks(id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
            SELECT NULL, ?, NULL, 'markdown', 0, NULL, '{}', ?, ? WHERE EXISTS (
              SELECT 1 FROM media_placements WHERE owner_type = 'content_document' AND owner_id IN (
                SELECT id FROM content_documents WHERE id = ? OR root_id = ?
              ) AND slot IN ('cover','gallery')
            )`, params: [postId, now, now, postId, postId],
        }] : [],
      })
      break
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (allocateSlug && attempt < 2 && message.includes('UNIQUE constraint failed') && message.includes('content_documents.slug')) {
        changes.slug = await allocatePostSlug(db, organizationId, slugSource, postId)
        continue
      }
      if (data.post_type === 'alert' && (await getPostMediaByPostIds(db, organizationId, [postId])).get(postId)?.media.length) throw new PostValidationError('Remove post media before changing the topic to alert')
      throw error
    }
  }

  const updated = await getPost(db, organizationId, postId)
  await refreshSocialCard({ db, env, owner: { owner_type: 'content_document', owner_id: postId }, actorId: _updatedBy })
  return updated
}

export async function publishPost(
  db: DbClient,
  organizationId: string,
  postId: string,
  channels: PostPublishChannel[],
  env: DomainEnv,
  socialPublish: PostSocialPublish | null,
): Promise<PostWithChannels | null> {
  if (!channels.length) {
    throw new Error('At least one publish channel is required')
  }
  const socialChannels = channels.filter((channel): channel is PostChannelState['channel'] =>
    channel === 'facebook' || channel === 'instagram',
  )
  if (socialChannels.length > 0 && !socialPublish) {
    throw new Error('Social publish capability is required for external channels')
  }

  const existing = await queryFirst<PostRow>(
    db,
    `SELECT id, organization_id, organization_id, location_id, slug, title, seo_title, seo_description, status, visibility, scheduled_for, published_at, created_by, created_at, updated_at, summary AS body, (metadata_json ->> '$.post_type') AS post_type, json_extract(metadata_json, '$.event') AS event, json_extract(metadata_json, '$.offer') AS offer, json_extract(metadata_json, '$.call_to_action') AS call_to_action, (metadata_json ->> '$.alert_type') AS alert_type, NULL AS location_phone FROM content_documents WHERE kind = 'social_post' AND row_role = 'root' AND id = ? AND organization_id = ?  LIMIT 1`,
    [postId, organizationId],
  )
  if (!existing) return null

  const now = new Date(Math.max(Date.now(), Date.parse(existing.updated_at) + 1)).toISOString()
  const slug = existing.slug ?? await allocatePostSlug(db, organizationId, existing.title ?? existing.body.slice(0, 80) ?? postId, postId)

  if (channels.includes('site')) {
    const [updateResult] = await executeBatch(db, [{
      query: `UPDATE content_documents
          SET status = 'published', slug = ?, scheduled_for = NULL,
              published_at = COALESCE(published_at, ?),
              first_published_at = CASE WHEN status = 'published' THEN first_published_at ELSE COALESCE(first_published_at, ?) END,
              updated_at = ?
        WHERE kind = 'social_post' AND row_role = 'root' AND id = ? AND organization_id = ? AND organization_id = ? AND updated_at = ?`,
      params: [slug, now, now, now, postId, organizationId, existing.updated_at],
    }, publicResourceCacheInvalidationQuery(organizationId, 'post-publish')])
    if (Number(updateResult?.meta.changes ?? 0) === 0) return null
  }

  const publishedChannels = channels.filter(channel => channel === 'site')

  const post = await getPost(db, organizationId, postId)
  if (post && channels.includes('site') && existing.status !== 'published') {
    await fireOrganizationEventSafe({
      db,
      organizationId,
      
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

  await refreshSocialCard({ db, env, owner: { owner_type: 'content_document', owner_id: postId } })

  const socialCapability = socialPublish
  for (const channel of socialChannels) {
    if (!(await claimPostChannelState(db, postId, channel, now))) continue

    if (socialCapability?.kind === 'unavailable') {
      await settlePostChannelState(db, postId, channel, { kind: 'skipped', reason: socialCapability.reason })
      continue
    }

    if (!socialCapability) throw new Error('Social publish capability is required for external channels')
    await publishPostChannel(db, postId, channel, post, socialCapability)
  }

  return await getPost(db, organizationId, postId)
}

async function claimPostChannelState(db: DbClient, postId: string, channel: PostChannelState['channel'], now: string): Promise<boolean> {
  const path = '$.channels.' + channel
  const claimed = await execute(db, `UPDATE content_documents SET
    metadata_json = json_set(metadata_json, ?, json_object('status', 'pending', 'provider_post_id', NULL,
      'error_message', NULL, 'published_at', NULL, 'created_at', COALESCE(json_extract(metadata_json, ?), ?))),
    updated_at = CASE WHEN ? > updated_at THEN ? ELSE strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') END
    WHERE id = ? AND kind = 'social_post' AND row_role = 'root'
      AND (json_type(metadata_json, ?) IS NULL OR json_extract(metadata_json, ?) = 'skipped')`,
  [path, path + '.created_at', now, now, now, postId, path, path + '.status'])
  return Number(claimed.meta.changes ?? 0) === 1
}

type PostChannelStateOutcome =
  | { kind: 'published'; providerPostId: string }
  | { kind: 'failed' | 'skipped'; reason: string }

async function settlePostChannelState(db: DbClient, postId: string, channel: PostChannelState['channel'], outcome: PostChannelStateOutcome) {
  const now = new Date().toISOString()
  const path = '$.channels.' + channel
  await execute(db, `UPDATE content_documents SET metadata_json = json_set(metadata_json,
    ?, ?, ?, ?, ?, ?, ?, ?),
    updated_at = CASE WHEN ? > updated_at THEN ? ELSE strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') END
    WHERE id = ? AND kind = 'social_post' AND row_role = 'root' AND json_extract(metadata_json, ?) = 'pending'`,
  [path + '.status', outcome.kind, path + '.provider_post_id', outcome.kind === 'published' ? outcome.providerPostId : null,
    path + '.error_message', outcome.kind === 'published' ? null : outcome.reason,
    path + '.published_at', outcome.kind === 'published' ? now : null, now, now, postId, path + '.status'])
}

async function publishPostChannel(
  db: DbClient,
  postId: string,
  channel: PostChannelState['channel'],
  post: PostWithChannels,
  socialPublish: Extract<PostSocialPublish, { kind: 'connected' }>,
) {
  if (channel === 'facebook') {
    let providerPostId: string
    try {
      const result = await publishToPage(socialPublish.pageToken, socialPublish.pageId, { message: post.body })
      providerPostId = result.id
    } catch (error) {
      await settlePostChannelState(db, postId, channel, {
        kind: 'failed',
        reason: error instanceof Error ? error.message : 'facebook publish failed',
      })
      return
    }
    await settlePostChannelState(db, postId, channel, { kind: 'published', providerPostId })
    return
  }

  const imageUrl = post.media?.find(item => item.slot === 'cover' && item.kind === 'image')?.public_url
  if (!imageUrl) {
    await settlePostChannelState(db, postId, channel, {
      kind: 'skipped',
      reason: 'Instagram requires an image. Add a photo to this post.',
    })
    return
  }

  let instagramAccountId: string | null
  try {
    instagramAccountId = await getLinkedInstagramAccount(socialPublish.pageToken, socialPublish.pageId)
  } catch (error) {
    await settlePostChannelState(db, postId, channel, {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'instagram account lookup failed',
    })
    return
  }
  if (!instagramAccountId) {
    await settlePostChannelState(db, postId, channel, {
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
    await settlePostChannelState(db, postId, channel, {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'instagram publish failed',
    })
    return
  }
  await settlePostChannelState(db, postId, channel, { kind: 'published', providerPostId })
}

interface DuePostRow {
  id: string
  organization_id: string
  location_id: string | null
  post_type: Post['post_type']
  scheduled_for: string
  updated_at: string
  slug: string | null
  title: string | null
  body: string
}

export async function publishDuePosts(db: DbClient, now = new Date()) {
  const nowIso = now.toISOString()
  const due = await queryAll<DuePostRow>(db, `
    SELECT id, organization_id, organization_id, location_id, (metadata_json ->> '$.post_type') AS post_type, scheduled_for, updated_at,
           slug, title, summary AS body
      FROM content_documents
     WHERE kind = 'social_post' AND row_role = 'root' AND status = 'scheduled' AND scheduled_for <= ?
     ORDER BY scheduled_for ASC, id ASC
     LIMIT 100
  `, [nowIso])
  let published = 0
  for (const post of due) {
    const previousUpdatedAt = Date.parse(post.updated_at)
    if (!Number.isFinite(previousUpdatedAt)) throw new Error(`Scheduled post ${post.id} has an invalid updated_at`)
    const updatedAt = new Date(Math.max(now.getTime(), previousUpdatedAt + 1)).toISOString()
    // The slug is allocated here for the same reason publishPost allocates it:
    // a published post's public path is its slug, and there is no second thing
    // to address it by. Publishing on a schedule skipped this and wrote
    // status='published' with slug NULL, so the post answered at its row id --
    // /posts/post-demo-1 -- while its translation announced
    // /posts/margherita-monday. Seven posts across two tenants reached
    // production that way.
    const slug = post.slug ?? await allocatePostSlug(db, post.organization_id, post.title ?? post.body.slice(0, 80) ?? post.id, post.id)
    const results = await executeBatch(db, [
      {
        query: `
          UPDATE content_documents
             SET status = 'published', slug = ?, scheduled_for = NULL,
                 published_at = scheduled_for, first_published_at = COALESCE(first_published_at, scheduled_for), updated_at = ?
           WHERE kind = 'social_post' AND row_role = 'root' AND id = ? AND status = 'scheduled' AND scheduled_for = ? AND scheduled_for <= ? AND updated_at = ?
        `,
        params: [slug, updatedAt, post.id, post.scheduled_for, nowIso, post.updated_at],
      },
      publicResourceCacheInvalidationQuery(post.organization_id, 'post-scheduled-publish'),
    ])
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) continue
    published += 1
    await fireOrganizationEventSafe({
      db,
      organizationId: post.organization_id,
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
  postId: string,
): Promise<boolean> {
  const results = await executeBatch(db, prepareContentDocumentDeletion({ documentId: postId, organizationId}))

  return Number(results.at(-1)?.meta.changes ?? 0) > 0
}

/** Public: published posts for the site, formatted for SayaPosts component. */
export async function getPublishedPosts(
  db: DbClient,
  organizationId: string,
  limit = 20,
  locationId?: string,
  locale = 'en',
): Promise<PublishedPostSummary[]> {
  let query = `
    SELECT p.id, p.organization_id, root.location_id, bl.title AS location_title, bl.slug AS location_slug, bl.phone AS location_phone,
           -- A translation's address is its own path column; only the source
           -- row carries a slug. Reading p.slug alone returned NULL for every
           -- representation, and the formatter below refuses a published post
           -- with no slug, so any locale but the source 500'd the moment a
           -- surface listed its posts.
           COALESCE(p.slug, ltrim(replace(p.path, '/posts/', ''), '/')) AS slug,
           (root.metadata_json ->> '$.post_type') AS post_type, p.title, p.summary AS body,
           p.seo_title, p.seo_description,
           json_extract(root.metadata_json, '$.call_to_action') AS call_to_action, CASE WHEN (root.metadata_json ->> '$.event') IS NULL THEN NULL ELSE json_patch(json_extract(root.metadata_json, '$.event'), COALESCE(json_extract(p.metadata_json, '$.event'), '{}')) END AS event, CASE WHEN (root.metadata_json ->> '$.offer') IS NULL THEN NULL ELSE json_patch(json_extract(root.metadata_json, '$.offer'), COALESCE(json_extract(p.metadata_json, '$.offer'), '{}')) END AS offer, (root.metadata_json ->> '$.alert_type') AS alert_type, root.published_at, p.created_at, p.updated_at
    FROM content_documents root JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
    LEFT JOIN business_locations bl ON root.location_id = bl.id
    WHERE root.kind = 'social_post' AND root.row_role = 'root' AND p.organization_id = ? AND root.status = 'published' AND root.visibility = 'public' AND p.summary IS NOT NULL
      AND ((root.metadata_json ->> '$.event') IS NULL OR length(trim(p.metadata_json ->> '$.event.title')) > 0)
      AND ((root.metadata_json ->> '$.offer.terms_conditions') IS NULL OR length(trim(p.metadata_json ->> '$.offer.terms_conditions')) > 0)
  `
  const params: SqlBindValue[] = [locale, organizationId]
  if (locationId) {
    query += ` AND root.location_id = ?`
    params.push(locationId)
  }
  query += ` ORDER BY root.published_at DESC LIMIT ?`
  params.push(limit)
  const rows = await queryAll<PublishedPostRow>(db, query, params)
  const [origin, mediaByPost] = await Promise.all([
    resolveSitePublicOrigin(db, organizationId),
    getPostMediaByPostIds(db, organizationId, (rows ?? []).map((post) => post.id)),
  ])

  return (rows ?? []).map((row) => formatPublishedPost(row, mediaByPost.get(row.id), origin, locale))
}

/**
 * One published post, addressed either by the slug its public URL carries or by
 * the row id a localized representation points back to with `root_id`.
 *
 * The caller says which. `(p.slug = ? OR p.id = ?)` accepted both for every
 * lookup, so each post answered at two addresses -- /posts/margherita-monday
 * and /posts/post-demo-3 both returned the same page.
 */
export async function getPublishedPost(
  db: DbClient,
  organizationId: string,
  key: { slug: string } | { id: string },
) {
  const row = await queryFirst<PublishedPostRow>(
    db,
    `
    SELECT p.id, p.organization_id, p.location_id, bl.title AS location_title, bl.slug AS location_slug, bl.phone AS location_phone,
           p.slug, (p.metadata_json ->> '$.post_type') AS post_type, p.title, p.summary AS body,
           p.seo_title, p.seo_description,
           json_extract(p.metadata_json, '$.call_to_action') AS call_to_action, json_extract(p.metadata_json, '$.event') AS event, json_extract(p.metadata_json, '$.offer') AS offer, (p.metadata_json ->> '$.alert_type') AS alert_type, p.published_at, p.created_at, p.updated_at
    FROM content_documents p
    LEFT JOIN business_locations bl ON p.location_id = bl.id
    WHERE p.kind = 'social_post' AND p.row_role = 'root' AND p.organization_id = ? AND p.status = 'published' AND ${'slug' in key ? 'p.slug = ?' : 'p.id = ?'}
    LIMIT 1
  `,
    [organizationId, 'slug' in key ? key.slug : key.id],
  )
  if (!row) return null
  const [origin, mediaByPost] = await Promise.all([
    resolveSitePublicOrigin(db, organizationId),
    getPostMediaByPostIds(db, organizationId, [row.id]),
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
  env: CloudflareEnv,
  db: DbClient,
  organizationId: string,
  slug: string,
  locale: string,
) {
  const site = await queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM organization WHERE id = ? AND status = \'active\' LIMIT 1', [organizationId])
  if (!site) return null

  const localizations = locale === 'en' ? [] : await loadExactPublicLocalizations(env, db, site.organization_id, locale)
  const translated = locale === 'en' ? null : await queryFirst<{
    id: string; root_id: string; title: string | null; summary: string | null;
    seo_title: string | null; seo_description: string | null; metadata_json: string;
  }>(db, `SELECT d.id, d.root_id, d.title, d.summary, d.seo_title, d.seo_description, d.metadata_json
    FROM content_documents d JOIN content_documents root ON root.id = d.root_id
    WHERE d.organization_id = ? AND d.locale = ? AND d.path = ? AND d.row_role = 'representation'
      AND root.kind = 'social_post' AND root.status = 'published' LIMIT 1`, [organizationId, locale, '/posts/' + slug])
  if (locale !== 'en' && !translated) return null
  const sourcePost = await getPublishedPost(db, organizationId, translated ? { id: translated.root_id } : { slug })
  if (!sourcePost) return null
  let post = sourcePost
  if (translated) {
    const metadata = JSON.parse(translated.metadata_json) as Record<string, unknown>
    const eventCopy = metadata.event as { title?: string } | undefined
    const offerCopy = metadata.offer as { terms_conditions?: string } | undefined
    if (!translated.summary || sourcePost.event && !eventCopy?.title?.trim() || sourcePost.offer?.terms_conditions && !offerCopy?.terms_conditions?.trim()) return null
    const topic = parsePostTopic({ ...topicFields(sourcePost),
      event: sourcePost.event ? { ...sourcePost.event, ...eventCopy } : null,
      offer: sourcePost.offer ? { ...sourcePost.offer, ...offerCopy } : null,
    })
    const socialMedia = (await getPostMediaByPostIds(db, organizationId, [translated.id])).get(translated.id)
    const media = publicMediaFromRows(socialMedia?.media)
    const publicPath = '/' + locale + '/posts/' + slug
    post = { ...sourcePost, id: translated.id, slug, title: translated.title ?? '', body: translated.summary, summary: translated.summary,
      seo_title: translated.seo_title, seo_description: translated.seo_description, public_path: publicPath,
      canonical_url: absoluteUrl(await resolveSitePublicOrigin(db, organizationId), publicPath),
      ...topic,
      media: projectLocalizedMediaAlt(media, localizations), social_image: socialMedia?.social_image ?? null,
    }
  }

  const localeRepresentations = await listPublicLocaleRepresentations(env, db, {
    organizationId: site.organization_id,
    
    sourcePath: sourcePost.public_path,
    documentId: sourcePost.id,
  })
  return { ...post, localeRepresentations }
}
