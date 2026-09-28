import { HTTPError } from 'nitro'
import { execute, executeBatch, queryAll, queryAllPages, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { readLinkedAccount, type CloudflareEnv } from '~/server/utils/auth'
import { filterEntitledRows } from '~/server/utils/billing-access'
import { prepareContentDocumentWithBlocks, updateContentDocument } from '~/server/utils/content/documents'
import { deleteMediaAsset, insertInitialMediaPlacements } from '~/server/utils/media-asset-manager'
import { MAX_IMAGE_BYTES, MAX_POSTER_BYTES, MAX_VIDEO_BYTES, POSTER_IMAGE_MIME_TYPES, RESOLVED_MEDIA_IMAGE_TYPES, VIDEO_MIME_TYPES, sniffMediaMimeType } from '~/server/utils/media-mime'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { MetaDeadline, MetaGraphError } from '~/server/utils/meta-graph'
import { organizationEventQuery } from '~/server/utils/organization-events'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { refreshSocialCard } from '~/server/utils/social-card'
import { normalizePostSlug } from '~/utils/post-slugs'
import type { SocialSyncProgress } from '~/shared/organization-settings'
import { POST_CALL_TO_ACTION_LABEL_MAX, POST_BODY_MAX } from '~/shared/posts'
import {
  facebookPageToken, getFacebookPagesConnection, listPagePosts, readPagePostRecord, readVideoSource,
  type FacebookAttachment, type FacebookPagePostRecord, type FacebookPageTarget,
} from '~/server/utils/facebook-pages'
import { instagramAccessToken, listMedia, readInstagramConnection, readMedia, type InstagramMediaRecord, type InstagramTarget } from '~/server/utils/instagram'

/**
 * Reading an organization's own Facebook Page and Instagram account into its
 * website — the provider read the hourly task and `sync_social_posts` both run.
 *
 * Every pass reads the newest page for new posts, then continues the history
 * walk from the cursor it kept, within its budget. When the walk reaches the
 * end, known posts it did not see are read by id, and only one Meta says does
 * not exist is marked removed. Absence from a page is not deletion.
 *
 * A post is created only through the canonical document writer, with its
 * media committed first and its provenance recorded on `post_publications`
 * and `media_assets.origin_publication_id` in the same batch.
 */

export const SYNC_BUDGET_MS = 25_000
const PAGE_SIZE = 25
const REMOVAL_PROBES_PER_PASS = 10

type Channel = 'facebook' | 'instagram'

export interface SyncChannelResult {
  channel: Channel
  target_id: string | null
  status: 'complete' | 'partial' | 'blocked' | 'failed' | 'not_connected'
  imported: number
  updated: number
  unchanged: number
  removed: number
  errors: Array<{ item: string | null; message: string }>
  blocked_by_publication_id: string | null
}

interface NativeMedia { id: string; kind: 'image' | 'video'; url: string; posterUrl: string | null; width: number | null; height: number | null; duration: number | null }
interface NativePost {
  id: string
  body: string | null
  callToAction: { label: string; url: string } | null
  permalink: string | null
  publishedAt: string
  media: NativeMedia[]
}

interface Reader {
  channel: Channel
  targetId: string
  appId: string
  subjectId: string
  list(after: string | null, deadline: MetaDeadline): Promise<{ items: NativePost[]; after: string | null; errors: Array<{ item: string; message: string }> }>
  read(id: string, deadline: MetaDeadline): Promise<NativePost>
}

// ── Provider records as posts ─────────────────────────────────────────────

function canonicalInstant(value: string | undefined, item: string): string {
  const time = value ? Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : Number.NaN
  if (!Number.isFinite(time)) throw new Error(`${item} has no valid timestamp (${value ?? 'none'})`)
  return new Date(time).toISOString()
}

function trimmedBody(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const body = value.replace(/^\s+|\s+$/g, '')
  return body.length > POST_BODY_MAX ? body.slice(0, POST_BODY_MAX) : body
}

async function facebookMedia(attachment: FacebookAttachment, target: FacebookPageTarget, deadline: MetaDeadline): Promise<NativeMedia[]> {
  const kind = attachment.media_type ?? attachment.type ?? ''
  if (attachment.subattachments?.data?.length) {
    return (await Promise.all(attachment.subattachments.data.map(child => facebookMedia(child, target, deadline)))).flat()
  }
  if (kind.startsWith('video') || attachment.type?.startsWith('video')) {
    const videoId = attachment.target?.id
    if (!videoId) throw new Error('A Facebook video attachment names no video')
    const source = attachment.media?.source ? { source: attachment.media.source, picture: attachment.media.image?.src ?? null, length: null } : await readVideoSource(target, videoId, deadline)
    return [{ id: videoId, kind: 'video', url: source.source, posterUrl: source.picture ?? attachment.media?.image?.src ?? null, width: null, height: null, duration: source.length }]
  }
  if (kind === 'photo' || kind === 'cover_photo' || kind === 'profile_media' || attachment.type === 'photo') {
    const image = attachment.media?.image
    if (!image?.src) throw new Error('A Facebook photo attachment carries no image')
    return [{ id: attachment.target?.id ?? image.src, kind: 'image', url: image.src, posterUrl: null, width: image.width ?? null, height: image.height ?? null, duration: null }]
  }
  return []
}

async function facebookNativePost(record: FacebookPagePostRecord, target: FacebookPageTarget, deadline: MetaDeadline): Promise<NativePost> {
  const attachments = record.attachments?.data ?? []
  const media = (await Promise.all(attachments.map(attachment => facebookMedia(attachment, target, deadline)))).flat()
  // A shared link is a content fact: its destination and the words Meta gave it.
  // A `story` ("… updated their cover photo") is Meta's narration, not the post.
  const link = attachments.find(attachment => attachment.type === 'share' && (attachment.unshimmed_url ?? attachment.url))
  const url = link ? link.unshimmed_url ?? link.url ?? null : null
  let body = trimmedBody(record.message)
  let callToAction: NativePost['callToAction'] = null
  if (url && /^https?:\/\//.test(url)) {
    const title = link?.title?.trim()
    if (title) callToAction = { label: title.length > POST_CALL_TO_ACTION_LABEL_MAX ? title.slice(0, POST_CALL_TO_ACTION_LABEL_MAX).trimEnd() : title, url }
    else if (!body?.includes(url)) body = trimmedBody([body, link?.description, url].filter(Boolean).join('\n\n'))
  }
  return { id: record.id, body, callToAction, permalink: record.permalink_url ?? null, publishedAt: canonicalInstant(record.created_time, `Facebook post ${record.id}`), media }
}

function instagramNativePost(record: InstagramMediaRecord): NativePost {
  const one = (item: { id: string; media_type: string; media_url?: string; thumbnail_url?: string }): NativeMedia => {
    if (!item.media_url) throw new Error(`Instagram media ${item.id} carries no media_url`)
    return item.media_type === 'VIDEO'
      ? { id: item.id, kind: 'video', url: item.media_url, posterUrl: item.thumbnail_url ?? null, width: null, height: null, duration: null }
      : { id: item.id, kind: 'image', url: item.media_url, posterUrl: null, width: null, height: null, duration: null }
  }
  const media = record.media_type === 'CAROUSEL_ALBUM'
    ? (record.children?.data ?? []).map(one)
    : [one(record)]
  if (record.media_type === 'CAROUSEL_ALBUM' && !media.length) throw new Error(`Instagram carousel ${record.id} returned no children`)
  return { id: record.id, body: trimmedBody(record.caption), callToAction: null, permalink: record.permalink ?? null, publishedAt: canonicalInstant(record.timestamp, `Instagram media ${record.id}`), media }
}

async function facebookReader(env: CloudflareEnv, organizationId: string) {
  const connection = await getFacebookPagesConnection(env, organizationId)
  if (!connection) return null
  const account = await readLinkedAccount(env, connection.account_id)
  if (!account) throw new Error('The Facebook account this connection was made through is no longer linked. Connect Facebook again.')
  const target: FacebookPageTarget = { pageId: connection.page_id, pageToken: await facebookPageToken(env, connection) }
  const reader: Reader = {
    channel: 'facebook', targetId: connection.page_id, appId: requiredAppId(env, 'facebook'), subjectId: account.providerAccountId,
    async list(after, deadline) {
      const page = await listPagePosts(target, { after, limit: PAGE_SIZE }, deadline)
      const items: NativePost[] = []
      const errors: Array<{ item: string; message: string }> = []
      for (const record of page.items) {
        try { items.push(await facebookNativePost(record, target, deadline)) } catch (error) { errors.push({ item: record.id, message: messageOf(error) }) }
      }
      return { items, after: page.after, errors }
    },
    async read(id, deadline) { return await facebookNativePost(await readPagePostRecord(target, id, deadline), target, deadline) },
  }
  return { connection, reader }
}

async function instagramReader(env: CloudflareEnv, organizationId: string) {
  const connection = await readInstagramConnection(env, organizationId)
  if (!connection) return null
  const account = await readLinkedAccount(env, connection.account_id)
  if (!account) throw new Error('The Instagram account this connection was made through is no longer linked. Connect Instagram again.')
  const target: InstagramTarget = { userId: connection.instagram_user_id, accessToken: await instagramAccessToken(env, connection.account_id) }
  const reader: Reader = {
    channel: 'instagram', targetId: connection.instagram_user_id, appId: requiredAppId(env, 'instagram'), subjectId: account.providerAccountId,
    async list(after, deadline) {
      const page = await listMedia(target, { after, limit: PAGE_SIZE }, deadline)
      const items: NativePost[] = []
      const errors: Array<{ item: string; message: string }> = []
      for (const record of page.items) {
        try { items.push(instagramNativePost(record)) } catch (error) { errors.push({ item: record.id, message: messageOf(error) }) }
      }
      return { items, after: page.after, errors }
    },
    async read(id, deadline) { return instagramNativePost(await readMedia(target, id, deadline)) },
  }
  return { connection, reader }
}

function requiredAppId(env: CloudflareEnv, channel: Channel): string {
  const value = channel === 'facebook' ? env.FACEBOOK_APP_ID : env.INSTAGRAM_APP_ID
  if (typeof value !== 'string' || !value) throw new Error(`${channel === 'facebook' ? 'FACEBOOK_APP_ID' : 'INSTAGRAM_APP_ID'} is not configured`)
  return value
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

// ── Media, through the canonical validated upload ─────────────────────────

const PROVIDER_MEDIA_HOSTS = ['fbcdn.net', 'cdninstagram.com', 'fbsbx.com', 'facebook.com', 'instagram.com']

/**
 * Bytes Meta serves for a post, fetched the way no arbitrary URL is: https
 * only, on Meta's own media hosts at every redirect, through the Worker's
 * public-only fetch, within the canonical size limit, and typed by what the
 * bytes are rather than what the URL says.
 */
async function providerMediaBytes(url: string, expect: 'image' | 'video' | 'poster', deadline: MetaDeadline): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }> {
  let current = url
  for (let hop = 0; hop < 4; hop += 1) {
    const parsed = new URL(current)
    if (parsed.protocol !== 'https:' || !PROVIDER_MEDIA_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
      throw new Error(`Media at ${parsed.hostname} is not on a Meta media host`)
    }
    const response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(deadline.requestTimeout(15_000)) })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`Meta redirected media without a location`)
      current = new URL(location, parsed).toString()
      continue
    }
    if (!response.ok) throw new Error(`Meta answered ${response.status} for media`)
    const limit = expect === 'video' ? MAX_VIDEO_BYTES : expect === 'poster' ? MAX_POSTER_BYTES : MAX_IMAGE_BYTES
    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > limit) throw new Error(`Media is ${declared} bytes; the limit is ${limit}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) throw new Error(`Media is ${bytes.byteLength} bytes; the limit is ${limit}`)
    const mimeType = sniffMediaMimeType(bytes)
    const allowed = expect === 'video' ? VIDEO_MIME_TYPES : expect === 'poster' ? POSTER_IMAGE_MIME_TYPES : RESOLVED_MEDIA_IMAGE_TYPES
    if (!allowed.has(mimeType) || mimeType === 'image/svg+xml') throw new Error(`Media is ${mimeType}, not ${expect === 'video' ? 'a supported video' : 'a supported image'}`)
    return { bytes, mimeType }
  }
  throw new Error('Meta redirected media too many times')
}

const extension = (mimeType: string) => mimeType.split('/')[1]!.replace('jpeg', 'jpg').replace('quicktime', 'mov')

async function storeNativeMedia(env: CloudflareEnv, organizationId: string, channel: Channel, item: NativeMedia, deadline: MetaDeadline): Promise<string> {
  const name = `${channel}-${item.id.replace(/[^\w-]/g, '').slice(0, 60) || 'media'}`
  const file = await providerMediaBytes(item.url, item.kind, deadline)
  if (item.kind === 'video') {
    if (!item.posterUrl) throw new Error(`${channel} video ${item.id} has no poster frame`)
    const poster = await providerMediaBytes(item.posterUrl, 'poster', deadline)
    const stored = await uploadResolvedMediaToAssetStore({ db: env.DB as DbClient, env, organizationId, kind: 'video', source: 'external', userId: null,
      buffer: file.bytes, contentType: file.mimeType, filename: `${name}.${extension(file.mimeType)}`, fileSize: file.bytes.byteLength,
      poster: { buffer: poster.bytes, contentType: poster.mimeType, filename: `${name}-poster.${extension(poster.mimeType)}` } })
    if (item.duration !== null) await execute(env.DB, 'UPDATE media_assets SET duration = ? WHERE id = ? AND organization_id = ?', [Math.round(item.duration), stored.assetId, organizationId])
    return stored.assetId
  }
  const stored = await uploadResolvedMediaToAssetStore({ db: env.DB as DbClient, env, organizationId, kind: 'image', source: 'external', userId: null,
    buffer: file.bytes, contentType: file.mimeType, filename: `${name}.${extension(file.mimeType)}`, fileSize: file.bytes.byteLength, width: item.width, height: item.height })
  return stored.assetId
}

/** Uploads a post's media, or removes whatever part of it was stored and fails. */
async function storePostMedia(env: CloudflareEnv, organizationId: string, channel: Channel, post: NativePost, deadline: MetaDeadline): Promise<string[]> {
  const stored: string[] = []
  try {
    for (const item of post.media) stored.push(await storeNativeMedia(env, organizationId, channel, item, deadline))
    return stored
  } catch (error) {
    await discardAssets(env, organizationId, stored, error)
    throw error
  }
}

async function discardAssets(env: CloudflareEnv, organizationId: string, assetIds: string[], cause: unknown): Promise<void> {
  const failures: string[] = []
  for (const assetId of assetIds) {
    try { await deleteMediaAsset(env.DB as DbClient, env, assetId, organizationId, null) } catch (cleanup) { failures.push(`${assetId}: ${messageOf(cleanup)}`) }
  }
  if (failures.length) throw new AggregateError([cause], `${messageOf(cause)}; and the media already stored could not be removed: ${failures.join('; ')}`)
}

// ── Writing one native post ───────────────────────────────────────────────

interface Association {
  id: string
  post_id: string | null
  origin: 'import' | 'publish'
  state: string
  provider_permalink: string | null
  provider_handles_json: string
  source: string | null
  updated_at: string
  document_updated_at: string | null
  body: string | null
  metadata_json: string | null
}

async function readAssociation(db: DbClient, organizationId: string, reader: Reader, providerPostId: string) {
  return await queryFirst<Association>(db, `SELECT p.id, p.post_id, p.origin, p.state, p.provider_permalink, p.provider_handles_json, d.source, p.updated_at,
      d.updated_at AS document_updated_at, d.summary AS body, d.metadata_json
    FROM post_publications p LEFT JOIN content_documents d ON d.id = p.post_id AND d.organization_id = p.organization_id
    WHERE p.organization_id = ? AND p.channel = ? AND p.provider_app_id = ? AND p.provider_post_id = ?`,
  [organizationId, reader.channel, reader.appId, providerPostId])
}

async function allocateImportSlug(db: DbClient, organizationId: string, postId: string, body: string | null) {
  const base = normalizePostSlug(body?.split('\n').find(line => line.trim())?.slice(0, 80) ?? '') || `update-${postId}`
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const taken = await queryFirst(db, "SELECT id FROM content_documents WHERE kind = 'social_post' AND locale = 'en' AND organization_id = ? AND slug = ? LIMIT 1", [organizationId, slug])
    if (!taken) return slug
  }
  return `update-${postId}`
}

const mediaHandles = (post: NativePost) => JSON.stringify({ media_ids: post.media.map(item => item.id) })

/** A post Meta holds and the website does not: created once, provider-owned, with its provenance. */
async function importNativePost(env: CloudflareEnv, organizationId: string, reader: Reader, post: NativePost, deadline: MetaDeadline): Promise<'imported' | 'unchanged'> {
  const db = env.DB as DbClient
  const assetIds = await storePostMedia(env, organizationId, reader.channel, post, deadline)
  const postId = crypto.randomUUID()
  const publicationId = crypto.randomUUID()
  const now = new Date().toISOString()
  const slug = await allocateImportSlug(db, organizationId, postId, post.body)
  const prepared = prepareContentDocumentWithBlocks({
    id: postId, organizationId, kind: 'social_post', rowRole: 'root', locale: 'en',
    title: null, summary: post.body, slug, status: 'published', visibility: 'listed', source: reader.channel,
    publishedAt: post.publishedAt, firstPublishedAt: post.publishedAt, createdBy: `${reader.channel}-sync`,
    metadata: post.callToAction ? { call_to_action: post.callToAction } : {},
  }, [])
  const queries: BatchQuery[] = [
    ...prepared.queries,
    { query: `INSERT INTO post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id, provider_target_id, origin, state,
        provider_post_id, provider_permalink, provider_handles_json, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'import', 'published', ?, ?, ?, ?, ?, ?)`,
    params: [publicationId, organizationId, postId, reader.channel, reader.appId, reader.subjectId, reader.targetId, post.id,
      post.permalink?.startsWith('https://') ? post.permalink : null, mediaHandles(post), post.publishedAt, now, now] },
    ...(assetIds.length ? [{ query: 'UPDATE media_assets SET origin_publication_id = ? WHERE organization_id = ? AND id IN (SELECT value FROM json_each(?))',
      params: [publicationId, organizationId, JSON.stringify(assetIds)] }] : []),
    ...insertInitialMediaPlacements({ organizationId, placement: { owner_type: 'content_document', owner_id: postId, slot: 'cover' }, media: assetIds.slice(0, 1).map(asset_id => ({ asset_id })), now }),
    ...insertInitialMediaPlacements({ organizationId, placement: { owner_type: 'content_document', owner_id: postId, slot: 'gallery' }, media: assetIds.slice(1).map(asset_id => ({ asset_id })), now }),
    organizationEventQuery({ organizationId, eventType: 'post.created', entityType: 'post', entityId: postId, actorType: 'system', metadata: { channel: reader.channel, provider_post_id: post.id } }),
    publicResourceCacheInvalidationQuery(organizationId, 'social-post-import'),
  ]
  try {
    await executeBatch(db, queries)
  } catch (error) {
    await discardAssets(env, organizationId, assetIds, error)
    // Another pass imported the same provider post first: the database decided.
    if (/UNIQUE constraint failed: post_publications/.test(messageOf(error))) return 'unchanged'
    throw error
  }
  await refreshSocialCard({ db, env, owner: { owner_type: 'content_document', owner_id: postId } })
  return 'imported'
}

/**
 * A known provider post seen again. A provider-owned copy takes Meta's current
 * words and media; a copy the tenant edited, and a post the tenant published
 * outward, keep theirs — only the link and status are refreshed. A post the
 * tenant deleted stays deleted.
 */
async function refreshNativePost(env: CloudflareEnv, organizationId: string, reader: Reader, association: Association, post: NativePost, deadline: MetaDeadline): Promise<'updated' | 'unchanged'> {
  const db = env.DB as DbClient
  const now = new Date().toISOString()
  const touch = { query: `UPDATE post_publications SET provider_permalink = COALESCE(?, provider_permalink), updated_at = ? WHERE id = ?`,
    params: [post.permalink?.startsWith('https://') ? post.permalink : null, now, association.id] }
  const providerOwned = association.origin === 'import' && association.post_id && association.source === reader.channel
  const sameMedia = association.provider_handles_json === mediaHandles(post)
  const sameText = association.body === post.body && JSON.stringify((JSON.parse(association.metadata_json ?? '{}') as { call_to_action?: unknown }).call_to_action ?? null) === JSON.stringify(post.callToAction)
  if (!providerOwned || (sameMedia && sameText)) {
    await executeBatch(db, [touch])
    return 'unchanged'
  }
  const assetIds = sameMedia ? [] : await storePostMedia(env, organizationId, reader.channel, post, deadline)
  const replacedAssets = sameMedia ? [] : (await queryAll<{ asset_id: string }>(db, `SELECT asset_id FROM media_placements
    WHERE organization_id = ? AND owner_type = 'content_document' AND owner_id = ? AND slot IN ('cover', 'gallery')`, [organizationId, association.post_id])).map(row => row.asset_id)
  try {
    await updateContentDocument(db, association.post_id!, {
      expected_updated_at: association.document_updated_at!,
      changes: { summary: post.body, metadata: post.callToAction ? { call_to_action: post.callToAction } : {} },
      additionalQueriesAfter: [
        ...(post.callToAction ? [] : [{ query: "UPDATE content_documents SET metadata_json = json_remove(metadata_json, '$.call_to_action') WHERE id = ?", params: [association.post_id] }]),
        // The copy stays the provider's only while no one has edited it; the guard is in the batch.
        { query: `INSERT INTO content_blocks (id, document_id, type, position, data_json) SELECT NULL, ?, 'markdown', 0, '{}'
            WHERE (SELECT source FROM content_documents WHERE id = ?) IS NOT ?`, params: [association.post_id, association.post_id, reader.channel] },
        ...(sameMedia ? [] : [
          { query: "DELETE FROM media_placements WHERE organization_id = ? AND owner_type = 'content_document' AND owner_id = ? AND slot IN ('cover', 'gallery')", params: [organizationId, association.post_id] },
          ...insertInitialMediaPlacements({ organizationId, placement: { owner_type: 'content_document', owner_id: association.post_id!, slot: 'cover' }, media: assetIds.slice(0, 1).map(asset_id => ({ asset_id })), now }),
          ...insertInitialMediaPlacements({ organizationId, placement: { owner_type: 'content_document', owner_id: association.post_id!, slot: 'gallery' }, media: assetIds.slice(1).map(asset_id => ({ asset_id })), now }),
          ...(assetIds.length ? [{ query: 'UPDATE media_assets SET origin_publication_id = ? WHERE organization_id = ? AND id IN (SELECT value FROM json_each(?))', params: [association.id, organizationId, JSON.stringify(assetIds)] }] : []),
          { query: 'UPDATE post_publications SET provider_handles_json = ? WHERE id = ?', params: [mediaHandles(post), association.id] },
        ]),
        touch,
      ],
    })
  } catch (error) {
    await discardAssets(env, organizationId, assetIds, error)
    // Edited between the read and the write: the tenant's edit stands.
    if (error instanceof HTTPError && error.status === 409) return 'unchanged'
    throw error
  }
  // Replaced provider media no longer shown anywhere is removed with the rest of the old version.
  for (const assetId of replacedAssets) {
    const stillPlaced = await queryFirst(db, 'SELECT 1 FROM media_placements WHERE organization_id = ? AND asset_id = ? LIMIT 1', [organizationId, assetId])
    if (!stillPlaced) await deleteMediaAsset(db, env, assetId, organizationId, null)
  }
  await refreshSocialCard({ db, env, owner: { owner_type: 'content_document', owner_id: association.post_id! } })
  return 'updated'
}

/**
 * Meta says this post no longer exists. The publication is removed; a
 * provider-owned website copy is unpublished, keeping its words; a copy the
 * tenant edited or wrote stays published without the channel mark.
 */
async function markRemoved(env: CloudflareEnv, organizationId: string, reader: Reader, association: Association) {
  const db = env.DB as DbClient
  const now = new Date().toISOString()
  const unpublish = association.origin === 'import' && association.post_id && association.source === reader.channel
  await executeBatch(db, [
    { query: "UPDATE post_publications SET state = 'removed', updated_at = ? WHERE id = ? AND state = 'published'", params: [now, association.id] },
    ...(unpublish ? [{ query: `UPDATE content_documents SET status = 'draft', published_at = NULL, updated_at = ?
        WHERE id = ? AND organization_id = ? AND kind = 'social_post' AND row_role = 'root' AND source = ?`, params: [now, association.post_id, organizationId, reader.channel] }] : []),
    publicResourceCacheInvalidationQuery(organizationId, 'social-post-removed'),
  ])
}

// ── One connection, one pass ──────────────────────────────────────────────

async function saveProgress(db: DbClient, organizationId: string, channel: Channel, revision: string, progress: SocialSyncProgress, status: 'active' | 'error') {
  await execute(db, `UPDATE organization SET integrations_json = json_set(integrations_json, '$.${channel}.sync', json(?), '$.${channel}.status', ?, '$.${channel}.updated_at', ?)
    WHERE id = ? AND json_extract(integrations_json, '$.${channel}.revision') IS ?`,
  [JSON.stringify(progress), status, new Date().toISOString(), organizationId, revision])
}

/** An outbound publication to this target whose final identity is not known yet. */
async function unresolvedOutbound(db: DbClient, organizationId: string, reader: Reader) {
  return await queryFirst<{ id: string }>(db, `SELECT id FROM post_publications
    WHERE organization_id = ? AND channel = ? AND provider_target_id = ? AND origin = 'publish' AND provider_post_id IS NULL
      AND state IN ('preparing', 'publishing', 'unknown', 'published') ORDER BY created_at LIMIT 1`,
  [organizationId, reader.channel, reader.targetId])
}

async function syncChannel(env: CloudflareEnv, organizationId: string, channel: Channel, budgetMs: number): Promise<SyncChannelResult> {
  const db = env.DB as DbClient
  const result: SyncChannelResult = { channel, target_id: null, status: 'complete', imported: 0, updated: 0, unchanged: 0, removed: 0, errors: [], blocked_by_publication_id: null }
  let opened: Awaited<ReturnType<typeof facebookReader>> | Awaited<ReturnType<typeof instagramReader>>
  const connectionRow = channel === 'facebook' ? await getFacebookPagesConnection(env, organizationId) : await readInstagramConnection(env, organizationId)
  if (!connectionRow) return { ...result, status: 'not_connected' }
  const targetId = channel === 'facebook' ? (connectionRow as { page_id: string }).page_id : (connectionRow as { instagram_user_id: string }).instagram_user_id
  result.target_id = targetId
  const previous = connectionRow.sync && connectionRow.sync.revision === connectionRow.revision && connectionRow.sync.target_id === targetId ? connectionRow.sync : null
  const progress: SocialSyncProgress = previous ?? { revision: connectionRow.revision, target_id: targetId, cursor: null, cycle_started_at: null,
    last_completed_scan_at: null, last_success_at: null, last_error: null, last_error_item: null, blocked_by_publication_id: null }
  try {
    opened = channel === 'facebook' ? await facebookReader(env, organizationId) : await instagramReader(env, organizationId)
  } catch (error) {
    // The connection is in error; its content is not.
    await saveProgress(db, organizationId, channel, connectionRow.revision, { ...progress, last_error: messageOf(error), last_error_item: null }, 'error')
    return { ...result, status: 'failed', errors: [{ item: null, message: messageOf(error) }] }
  }
  const { reader } = opened!
  const deadline = new MetaDeadline(budgetMs)
  const blocker = await unresolvedOutbound(db, organizationId, reader)
  result.blocked_by_publication_id = blocker?.id ?? null
  const now = () => new Date().toISOString()
  const seen = async (post: NativePost) => {
    const association = await readAssociation(db, organizationId, reader, post.id)
    if (association && !association.post_id) {
      // Deleted on the website: the identity stays so it is never brought back.
      await execute(db, 'UPDATE post_publications SET updated_at = ? WHERE id = ?', [now(), association.id])
      return 'unchanged' as const
    }
    if (association) return await refreshNativePost(env, organizationId, reader, association, post, deadline)
    if (blocker) return 'blocked' as const
    return await importNativePost(env, organizationId, reader, post, deadline)
  }
  /** Applies one page; false when the budget ran out before the page was finished. */
  const apply = async (items: NativePost[], errors: Array<{ item: string; message: string }>) => {
    result.errors.push(...errors)
    for (const post of items) {
      if (deadline.remaining() < 3_000) return false
      try {
        const outcome = await seen(post)
        if (outcome === 'imported') result.imported += 1
        else if (outcome === 'updated') result.updated += 1
        else if (outcome === 'unchanged') result.unchanged += 1
      } catch (error) {
        result.errors.push({ item: post.id, message: messageOf(error) })
      }
    }
    return true
  }
  try {
    // 1. The newest page, every pass.
    const head = await reader.list(null, deadline)
    let finished = await apply(head.items, head.errors)
    // 2. The history walk: resumed where it stopped, or begun after the head.
    const walkStartedAt = progress.cycle_started_at ?? now()
    let cursor = progress.cycle_started_at ? progress.cursor : head.after
    // A blocked target does not walk: the walk resumes once the outbound
    // publication that could race it has its identity.
    if (!blocker) {
      while (finished && cursor && deadline.remaining() > 5_000) {
        const page = await reader.list(cursor, deadline)
        finished = await apply(page.items, page.errors)
        if (finished) cursor = page.after
      }
    }
    // 3. At the end of a walk, the known posts it did not see are read one by
    //    one. Only Meta saying one does not exist is a removal.
    let probesLeft = true
    if (!blocker && finished && cursor === null) {
      const unseen = await queryAll<Association & { provider_post_id: string }>(db, `SELECT p.id, p.post_id, p.origin, p.state, p.provider_permalink, p.provider_handles_json,
          d.source, p.updated_at, d.updated_at AS document_updated_at, d.summary AS body, d.metadata_json, p.provider_post_id
        FROM post_publications p LEFT JOIN content_documents d ON d.id = p.post_id AND d.organization_id = p.organization_id
        WHERE p.organization_id = ? AND p.channel = ? AND p.provider_target_id = ? AND p.state = 'published' AND p.provider_post_id IS NOT NULL AND p.updated_at < ?
        ORDER BY p.updated_at LIMIT ?`, [organizationId, channel, reader.targetId, walkStartedAt, REMOVAL_PROBES_PER_PASS + 1])
      probesLeft = unseen.length > REMOVAL_PROBES_PER_PASS
      for (const association of unseen.slice(0, REMOVAL_PROBES_PER_PASS)) {
        if (deadline.remaining() < 3_000) { probesLeft = true; break }
        try {
          await seen(await reader.read(association.provider_post_id, deadline))
        } catch (error) {
          if (error instanceof MetaGraphError && error.objectMissing) {
            await markRemoved(env, organizationId, reader, association)
            result.removed += 1
          } else {
            result.errors.push({ item: association.provider_post_id, message: messageOf(error) })
            probesLeft = true
          }
        }
      }
    }
    const walkComplete = !blocker && finished && cursor === null && !probesLeft
    result.status = blocker ? 'blocked' : !walkComplete || result.errors.length ? 'partial' : 'complete'
    const lastError = result.errors.at(-1) ?? null
    await saveProgress(db, organizationId, channel, connectionRow.revision, {
      ...progress,
      cursor: walkComplete ? null : cursor,
      cycle_started_at: walkComplete ? null : walkStartedAt,
      last_completed_scan_at: walkComplete ? now() : progress.last_completed_scan_at,
      last_success_at: result.errors.length ? progress.last_success_at : now(),
      last_error: lastError?.message ?? null,
      last_error_item: lastError?.item ?? null,
      blocked_by_publication_id: blocker?.id ?? null,
    }, result.errors.length ? 'error' : 'active')
    return result
  } catch (error) {
    await saveProgress(db, organizationId, channel, connectionRow.revision, { ...progress, last_error: messageOf(error), last_error_item: null, blocked_by_publication_id: blocker?.id ?? null }, 'error')
    return { ...result, status: 'failed', errors: [...result.errors, { item: null, message: messageOf(error) }] }
  }
}

/** One organization's Facebook and Instagram, each on its own. */
export async function syncSocialPosts(env: CloudflareEnv, organizationId: string, budgetMs = SYNC_BUDGET_MS): Promise<SyncChannelResult[]> {
  return [await syncChannel(env, organizationId, 'facebook', budgetMs), await syncChannel(env, organizationId, 'instagram', budgetMs)]
}

/** Every Growth organization with a connection: what the hourly task runs. */
export async function syncAllSocialPosts(env: CloudflareEnv) {
  const candidates = await queryAllPages<{ organization_id: string }>(env.DB as DbClient, `
    SELECT id AS organization_id FROM organization
     WHERE json_extract(integrations_json, '$.facebook.status') IN ('active', 'error')
        OR json_extract(integrations_json, '$.instagram.status') IN ('active', 'error')
     ORDER BY id`, [])
  const organizations = await filterEntitledRows(env, candidates, 'managed_service')
  const details: Array<SyncChannelResult & { organization_id: string }> = []
  for (const row of organizations) {
    for (const result of await syncSocialPosts(env, row.organization_id)) {
      if (result.status !== 'not_connected') details.push({ organization_id: row.organization_id, ...result })
    }
  }
  return details
}

