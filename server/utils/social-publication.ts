import { HTTPError } from 'nitro'
import { executeBatch, execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { readLinkedAccount, type CloudflareEnv } from '~/server/utils/auth'
import { hasOrganizationEntitlement } from '~/server/utils/billing'
import { organizationEventQuery } from '~/server/utils/organization-events'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { getPost, postPayloadFingerprint, type Post, type PostMedia } from '~/server/utils/post-management'
import { providerCaption } from '~/shared/posts'
import { MetaDeadline, MetaGraphError } from '~/server/utils/meta-graph'
import {
  createUnpublishedPhoto, createUnpublishedVideo, deleteUnpublishedObject, facebookPageToken,
  getFacebookPagesConnection, publishPagePost, publishVideo, readPagePost, readVideo, type FacebookPageTarget,
} from '~/server/utils/facebook-pages'
import {
  createMediaContainer, instagramAccessToken, publishContainer, readContainerStatus, readInstagramConnection, readMedia, type InstagramTarget,
} from '~/server/utils/instagram'
import { d1JsonStringSet } from '~/server/db/d1-limits'

/**
 * Publishing a post to its website and to the Facebook Page and Instagram
 * professional account the organization connected — one operation, shared by
 * MCP and the dashboard, returning one result.
 *
 * External publication uses Meta's own two-step primitives: prepare an object
 * that is not public, save its identity, then publish that same object. The
 * saved identity is what makes a retry safe: a later call resumes or reads the
 * object it already has instead of creating another public post. There is no
 * scheduler and no queue; an invocation does what fits in its budget and says
 * what it left.
 */

export const PUBLISH_BUDGET_MS = 30_000
/** A preparation claim older than this belongs to an invocation that is gone. */
export const CLAIM_STALE_MS = 60_000

export type SocialChannel = 'facebook' | 'instagram'
export type PublishTarget =
  | { channel: 'organization' }
  | { channel: SocialChannel; target_id: string; connection_revision: string }

export type PublishOutcomeStatus = 'published' | 'already_published' | 'processing' | 'failed' | 'unknown' | 'skipped'

export interface PublishOutcome {
  channel: 'organization' | SocialChannel
  target_id: string
  status: PublishOutcomeStatus
  publication_id?: string
  public_url?: string | null
  code?: string
  message?: string
}

export interface PublishResult {
  ok: boolean
  post_id: string
  updated_at: string
  outcomes: PublishOutcome[]
}

// ── Targets and connections ───────────────────────────────────────────────

export function parsePublishTargets(value: unknown): PublishTarget[] {
  const fail = (message: string): never => { throw new HTTPError({ statusCode: 400, statusMessage: message }) }
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) fail('targets must list one to three destinations')
  const targets = (value as unknown[]).map((item, index): PublishTarget => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`targets[${index}] must be an object`)
    const record = item as Record<string, unknown>
    if (record.channel === 'organization') {
      if (Object.keys(record).some(key => key !== 'channel')) fail(`targets[${index}]: the website target takes only its channel`)
      return { channel: 'organization' }
    }
    if (record.channel !== 'facebook' && record.channel !== 'instagram') fail(`targets[${index}].channel must be organization, facebook or instagram`)
    if (typeof record.target_id !== 'string' || !record.target_id.trim()) fail(`targets[${index}].target_id is required; read it from get_social_connections`)
    if (typeof record.connection_revision !== 'string' || !record.connection_revision.trim()) fail(`targets[${index}].connection_revision is required; read it from get_social_connections`)
    if (Object.keys(record).some(key => !['channel', 'target_id', 'connection_revision'].includes(key))) fail(`targets[${index}] has an unknown field`)
    return { channel: record.channel as SocialChannel, target_id: record.target_id as string, connection_revision: record.connection_revision as string }
  })
  if (new Set(targets.map(target => target.channel)).size !== targets.length) fail('targets names a channel more than once')
  return targets
}

interface ConnectionRead {
  channel: SocialChannel
  connected: boolean
  targetId: string | null
  targetName: string | null
  revision: string | null
  status: string | null
  accountId: string | null
  sync: unknown
}

async function readConnection(env: CloudflareEnv, organizationId: string, channel: SocialChannel): Promise<ConnectionRead> {
  if (channel === 'facebook') {
    const connection = await getFacebookPagesConnection(env, organizationId)
    return { channel, connected: Boolean(connection), targetId: connection?.page_id ?? null, targetName: connection?.page_name ?? null,
      revision: connection?.revision ?? null, status: connection?.status ?? null, accountId: connection?.account_id ?? null, sync: connection?.sync ?? null }
  }
  const connection = await readInstagramConnection(env, organizationId)
  return { channel, connected: Boolean(connection), targetId: connection?.instagram_user_id ?? null, targetName: connection ? `@${connection.username}` : null,
    revision: connection?.revision ?? null, status: connection?.status ?? null, accountId: connection?.account_id ?? null, sync: connection?.sync ?? null }
}

const SUPPORTED_FORMATS: Record<SocialChannel, string[]> = {
  facebook: ['text', 'link', 'image', 'multiple_images', 'video'],
  instagram: ['image', 'carousel', 'mixed_carousel', 'video_reel'],
}

/**
 * What the organization can publish to, exactly: each channel's selected
 * target and the revision a publish call must present, what formats it takes,
 * what stands in the way, how its import is doing, and where a person connects
 * it. Never a token.
 */
export async function getSocialConnections(env: CloudflareEnv, organizationId: string, links: { dashboardBase: string }) {
  const entitled = await hasOrganizationEntitlement(env, organizationId, 'managed_service')
  const channels = await Promise.all((['facebook', 'instagram'] as const).map(async (channel) => {
    const connection = await readConnection(env, organizationId, channel)
    const problems: Array<{ code: string; message: string }> = []
    if (!entitled) problems.push({ code: 'growth_plan_required', message: 'Publishing to Facebook and Instagram requires the Growth plan.' })
    if (!connection.connected) problems.push({ code: 'not_connected', message: `No ${channel === 'facebook' ? 'Facebook Page' : 'Instagram professional account'} is connected.` })
    else if (!connection.accountId || !(await readLinkedAccount(env, connection.accountId))) problems.push({ code: 'account_unlinked', message: `The ${channel} account this connection was made through is no longer linked. Connect it again.` })
    else if (connection.status === 'error') problems.push({ code: 'connection_error', message: `The last ${channel} sync failed; see sync.last_error.` })
    return {
      channel,
      connected: connection.connected,
      target_id: connection.targetId,
      target_name: connection.targetName,
      connection_revision: connection.revision,
      supported_formats: SUPPORTED_FORMATS[channel],
      problems,
      sync: connection.sync,
      connect_url: `${links.dashboardBase}/settings/integrations/${channel}`,
    }
  }))
  return { website: { channel: 'organization' as const, target_id: organizationId, label: 'Website' }, channels }
}

// ── Payload validation ────────────────────────────────────────────────────

interface AssetFacts { asset_id: string; mime_type: string | null; file_size: number | null; duration: number | null; kind: 'image' | 'video'; public_url: string }

async function assetFacts(db: DbClient, organizationId: string, media: PostMedia[]): Promise<AssetFacts[]> {
  if (!media.length) return []
  const rows = await queryAll<{ id: string; file_size: number | null }>(db, 'SELECT id, file_size FROM media_assets WHERE organization_id = ? AND id IN (SELECT value FROM json_each(?))',
    [organizationId, d1JsonStringSet(media.map(item => item.asset_id))])
  const sizes = new Map(rows.map(row => [row.id, row.file_size]))
  return media.map(item => ({ asset_id: item.asset_id, mime_type: item.mime_type, file_size: sizes.get(item.asset_id) ?? null, duration: item.duration, kind: item.kind, public_url: item.public_url }))
}

const hashtagCount = (text: string) => (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length
const mentionCount = (text: string) => (text.match(/(^|\s)@[\w.]+/g) ?? []).length

/** The first rule this post breaks for this channel, precisely; null when it can be sent. */
export function formatViolation(channel: SocialChannel, caption: string, assets: AssetFacts[]): { code: string; message: string } | null {
  const images = assets.filter(asset => asset.kind === 'image')
  const videos = assets.filter(asset => asset.kind === 'video')
  const unreachable = assets.find(asset => !/^https:\/\//.test(asset.public_url))
  if (unreachable) return { code: 'media_not_public', message: `${channel} fetches media itself and needs a public https URL; asset ${unreachable.asset_id} is at ${unreachable.public_url}` }
  if (channel === 'facebook') {
    if (caption.length > 63_206) return { code: 'caption_too_long', message: `Facebook text is limited to 63206 characters; this is ${caption.length}` }
    if (videos.length && (videos.length > 1 || images.length)) return { code: 'unsupported_combination', message: 'A Facebook post carries photos or one video, not both and not several videos' }
    const image = images.find(asset => !['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'].includes(asset.mime_type ?? ''))
    if (image) return { code: 'unsupported_media_type', message: `Facebook photos are JPEG, PNG, GIF, BMP or TIFF; asset ${image.asset_id} is ${image.mime_type ?? 'of unknown type'}` }
    const large = images.find(asset => (asset.file_size ?? 0) > 10 * 1024 * 1024)
    if (large) return { code: 'media_too_large', message: `Facebook photos are limited to 10 MB; asset ${large.asset_id} is ${Math.ceil((large.file_size ?? 0) / 1024 / 1024)} MB` }
    const video = videos.find(asset => !['video/mp4', 'video/quicktime'].includes(asset.mime_type ?? ''))
    if (video) return { code: 'unsupported_media_type', message: `Facebook video is MP4 or MOV; asset ${video.asset_id} is ${video.mime_type ?? 'of unknown type'}` }
    return null
  }
  if (!assets.length) return { code: 'media_required', message: 'Instagram posts need at least one image or video' }
  if (assets.length > 10) return { code: 'too_many_media', message: `An Instagram carousel holds at most 10 items; this post has ${assets.length}` }
  if (caption.length > 2200) return { code: 'caption_too_long', message: `Instagram captions are limited to 2200 characters; this is ${caption.length}` }
  if (hashtagCount(caption) > 30) return { code: 'too_many_hashtags', message: `Instagram allows 30 hashtags; this caption has ${hashtagCount(caption)}` }
  if (mentionCount(caption) > 20) return { code: 'too_many_mentions', message: `Instagram allows 20 @mentions; this caption has ${mentionCount(caption)}` }
  const image = images.find(asset => asset.mime_type !== 'image/jpeg')
  if (image) return { code: 'unsupported_media_type', message: `Instagram accepts JPEG images only; asset ${image.asset_id} is ${image.mime_type ?? 'of unknown type'}` }
  const largeImage = images.find(asset => (asset.file_size ?? 0) > 8 * 1024 * 1024)
  if (largeImage) return { code: 'media_too_large', message: `Instagram images are limited to 8 MB; asset ${largeImage.asset_id} is ${Math.ceil((largeImage.file_size ?? 0) / 1024 / 1024)} MB` }
  const video = videos.find(asset => !['video/mp4', 'video/quicktime'].includes(asset.mime_type ?? ''))
  if (video) return { code: 'unsupported_media_type', message: `Instagram video is MP4 or MOV; asset ${video.asset_id} is ${video.mime_type ?? 'of unknown type'}` }
  const [minimum, maximum] = assets.length > 1 ? [3, 60] : [3, 900]
  const outOfRange = videos.find(asset => asset.duration === null || asset.duration < minimum || asset.duration > maximum)
  if (outOfRange) return { code: 'video_duration', message: `Instagram ${assets.length > 1 ? 'carousel videos' : 'Reels'} run ${minimum}–${maximum} seconds; asset ${outOfRange.asset_id} is ${outOfRange.duration === null ? 'of unrecorded length' : `${outOfRange.duration} seconds`}` }
  return null
}

function publishable(post: Pick<Post, 'body' | 'media' | 'call_to_action'>): boolean {
  return Boolean(post.body?.trim()) || post.media.length > 0 || post.call_to_action !== null
}

// ── The publication relation ──────────────────────────────────────────────

interface PublicationRecord {
  id: string
  organization_id: string
  post_id: string | null
  channel: SocialChannel
  provider_app_id: string
  provider_subject_id: string
  provider_target_id: string
  origin: 'import' | 'publish'
  state: 'preparing' | 'publishing' | 'published' | 'failed' | 'unknown' | 'removed'
  provider_post_id: string | null
  provider_permalink: string | null
  provider_handles_json: string
  payload_hash: string | null
  attempt_id: string | null
  error_code: string | null
  error_message: string | null
  published_at: string | null
  updated_at: string
}

/** Native identities a publication saved, by channel. Identifiers only. */
interface Handles {
  photo_ids?: string[]
  post_id?: string
  video_id?: string
  children?: string[]
  container_id?: string
}

async function readPublication(db: DbClient, organizationId: string, where: { id: string } | { postId: string; channel: SocialChannel }) {
  return await queryFirst<PublicationRecord>(db, 'id' in where
    ? 'SELECT * FROM post_publications WHERE organization_id = ? AND id = ?'
    : 'SELECT * FROM post_publications WHERE organization_id = ? AND post_id = ? AND channel = ?',
  'id' in where ? [organizationId, where.id] : [organizationId, where.postId, where.channel])
}

const nowIso = () => new Date().toISOString()

class ClaimLost extends Error {}

/** Every update an invocation makes is fenced by its claim; losing it stops the invocation. */
function claimed(db: DbClient, publicationId: string, attemptId: string) {
  const write = async (sets: string, params: unknown[], states: readonly string[] = ['preparing']) => {
    const result = await execute(db, `UPDATE post_publications SET ${sets}, updated_at = ? WHERE id = ? AND attempt_id = ? AND state IN (SELECT value FROM json_each(?))`,
      [...params, nowIso(), publicationId, attemptId, JSON.stringify(states)])
    if (Number(result.meta?.changes ?? 0) !== 1) throw new ClaimLost(`Publication ${publicationId} is no longer claimed by this invocation`)
  }
  return {
    saveHandles: (handles: Handles, providerPostId?: string) =>
      write('provider_handles_json = ?, provider_post_id = COALESCE(?, provider_post_id)', [JSON.stringify(handles), providerPostId ?? null]),
    /** The prepared object named as the provider post is gone; the row stops naming it. */
    forgetProviderPost: (handles: Handles) => write('provider_handles_json = ?, provider_post_id = NULL', [JSON.stringify(handles)]),
    /** The boundary: after this commits, an interruption is `unknown`, never a retryable failure. */
    beginFinal: () => write("state = 'publishing'", []),
    published: (input: { providerPostId: string | null; permalink: string | null; publishedAt: string; handles: Handles }) =>
      write("state = 'published', attempt_id = NULL, provider_post_id = COALESCE(?, provider_post_id), provider_permalink = ?, published_at = ?, provider_handles_json = ?, error_code = NULL, error_message = NULL",
        [input.providerPostId, validPermalink(input.permalink), input.publishedAt, JSON.stringify(input.handles)], ['preparing', 'publishing']),
    failed: (code: string, message: string, handles: Handles) =>
      write("state = 'failed', attempt_id = NULL, error_code = ?, error_message = ?, provider_handles_json = ?", [code, message.slice(0, 1000), JSON.stringify(handles)], ['preparing', 'publishing']),
    unknown: (code: string, message: string) =>
      write("state = 'unknown', attempt_id = NULL, error_code = ?, error_message = ?", [code, message.slice(0, 1000)], ['publishing']),
    /** Hand the saved preparation to the next call: nothing is public, and nothing is lost. */
    release: (states: readonly string[] = ['preparing']) => write("state = 'preparing', attempt_id = NULL", [], states),
  }
}

/** Meta's times (`2026-09-28T10:00:00+0000`) as the canonical UTC instant the schema stores; now when Meta gave none. */
function instantOf(value: string | null | undefined): string {
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : nowIso()
}

/** A permalink is stored only as Meta returned it, and only when it is a public https URL. */
function validPermalink(value: string | null): string | null {
  if (!value) return null
  try { return new URL(value).protocol === 'https:' ? value : null } catch { return null }
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

// ── Channel operations ────────────────────────────────────────────────────

interface ChannelContext {
  db: DbClient
  env: CloudflareEnv
  organizationId: string
  post: Post
  caption: string
  publication: PublicationRecord
  attemptId: string
  handles: Handles
  deadline: MetaDeadline
}

type ChannelResult = PublishOutcome

async function facebookTargetFor(env: CloudflareEnv, organizationId: string): Promise<FacebookPageTarget> {
  const connection = await getFacebookPagesConnection(env, organizationId)
  if (!connection) throw new Error('No Facebook Page is connected')
  return { pageId: connection.page_id, pageToken: await facebookPageToken(env, connection) }
}

async function instagramTargetFor(env: CloudflareEnv, organizationId: string): Promise<InstagramTarget> {
  const connection = await readInstagramConnection(env, organizationId)
  if (!connection) throw new Error('No Instagram account is connected')
  return { userId: connection.instagram_user_id, accessToken: await instagramAccessToken(env, connection.account_id) }
}

/**
 * The final call starts only with time left for it and its read-back; with
 * less, the saved preparation is handed to the next call instead, so a budget
 * that ran out is `processing`, never an `unknown` the owner has to resolve.
 */
const FINAL_RESERVE_MS = 15_000
async function deferFinalWithoutTime(context: ChannelContext, fence: ReturnType<typeof claimed>): Promise<ChannelResult | null> {
  if (context.deadline.remaining() >= FINAL_RESERVE_MS) return null
  await fence.release()
  return outcome(context, 'processing', { code: 'budget_exhausted', message: `${context.publication.channel} is prepared; call publish_post again to publish this same post.` })
}

function outcome(context: ChannelContext, status: PublishOutcomeStatus, extra: Partial<PublishOutcome> = {}): ChannelResult {
  return { channel: context.publication.channel, target_id: context.publication.provider_target_id, status, publication_id: context.publication.id, ...extra }
}

/** Meta's failure, as the publication records it. */
function failureOf(error: unknown): { code: string; message: string } {
  if (error instanceof MetaGraphError) {
    return { code: error.failure === 'authorization' ? 'connection_error' : error.failure === 'transport' ? 'provider_unreachable' : 'provider_rejected',
      message: `${error.message}${error.details.fbtraceId ? ` (fbtrace_id ${error.details.fbtraceId})` : ''}` }
  }
  return { code: 'provider_rejected', message: messageOf(error) }
}

async function publishToFacebook(context: ChannelContext, target: FacebookPageTarget): Promise<ChannelResult> {
  const { post, handles, deadline } = context
  const fence = claimed(context.db, context.publication.id, context.attemptId)
  const video = post.media.find(item => item.kind === 'video')
  if (video) {
    if (!handles.video_id) {
      handles.video_id = await createUnpublishedVideo(target, { fileUrl: video.public_url, description: context.caption, title: post.title }, deadline)
      await fence.saveHandles(handles)
    }
    const state = await readVideo(target, handles.video_id, deadline)
    if (state.published) {
      await fence.published({ providerPostId: state.postId ?? handles.video_id, permalink: state.permalink, publishedAt: nowIso(), handles })
      return outcome(context, 'published', { public_url: validPermalink(state.permalink) })
    }
    if (state.processing === 'error') {
      await fence.failed('provider_processing_failed', state.error ?? 'Facebook could not process the video', handles)
      return outcome(context, 'failed', { code: 'provider_processing_failed', message: state.error ?? 'Facebook could not process the video' })
    }
    if (state.processing === 'processing') {
      await fence.release()
      return outcome(context, 'processing', { code: 'video_processing', message: 'Facebook is still processing the video. Call publish_post again to finish it; it will publish this same video.' })
    }
    const deferred = await deferFinalWithoutTime(context, fence)
    if (deferred) return deferred
    await fence.beginFinal()
    return await finalize(context, async () => { await publishVideo(target, handles.video_id!, deadline); return null }, async () => {
      const read = await readVideo(target, handles.video_id!, deadline)
      return { published: read.published, providerPostId: read.postId ?? handles.video_id!, permalink: read.permalink, retryable: !read.published && read.processing === 'ready' }
    })
  }
  const images = post.media.filter(item => item.kind === 'image')
  handles.photo_ids ??= []
  for (const [index, image] of images.entries()) {
    if (handles.photo_ids[index]) continue
    handles.photo_ids[index] = await createUnpublishedPhoto(target, { url: image.public_url, altText: image.alt_text }, deadline)
    await fence.saveHandles(handles)
  }
  // An unpublished feed post an earlier version prepared can never be
  // published; it goes, and the photos it carried are attached to the real post.
  if (handles.post_id) {
    try {
      await deleteUnpublishedObject(target, handles.post_id, deadline)
    } catch (error) {
      // Already gone is the state this wants.
      if (!(error instanceof MetaGraphError && error.objectMissing)) throw error
    }
    delete handles.post_id
    await fence.forgetProviderPost(handles)
  }
  const deferred = await deferFinalWithoutTime(context, fence)
  if (deferred) return deferred
  await fence.beginFinal()
  const link = post.call_to_action && /^https?:/.test(post.call_to_action.url) ? post.call_to_action.url : null
  let postId: string | null = null
  return await finalize(context, async () => {
    postId = await publishPagePost(target, { message: context.caption, link, photoIds: handles.photo_ids! }, deadline)
    return postId
  }, async () => {
    // Without the answer there is no id to read: what happened is unknown.
    if (!postId) throw new Error('Facebook did not answer with the post it created')
    const read = await readPagePost(target, postId, deadline)
    // Calling again would create a second post: a created post is never sent again.
    return { published: read.isPublished, providerPostId: read.id, permalink: read.permalink, publishedAt: read.createdTime, retryable: false, createsAnother: true }
  })
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Waits for a container Instagram is still processing, within the invocation's budget. */
async function containerReady(target: InstagramTarget, containerId: string, deadline: MetaDeadline): Promise<'FINISHED' | 'IN_PROGRESS' | 'EXPIRED' | 'ERROR' | 'PUBLISHED'> {
  for (;;) {
    const { status } = await readContainerStatus(target, containerId, deadline)
    if (status !== 'IN_PROGRESS') return status
    if (deadline.remaining() < 8_000) return 'IN_PROGRESS'
    await pause(3_000)
  }
}

async function publishToInstagram(context: ChannelContext, target: InstagramTarget): Promise<ChannelResult> {
  const { post, handles, deadline } = context
  const fence = claimed(context.db, context.publication.id, context.attemptId)
  const notReady = async (status: string) => {
    if (status === 'IN_PROGRESS') {
      await fence.release()
      return outcome(context, 'processing', { code: 'container_processing', message: 'Instagram is still processing the media. Call publish_post again to finish it; it will publish these same containers.' })
    }
    // Instagram itself reports these containers as not published and unusable.
    await fence.failed(status === 'EXPIRED' ? 'container_expired' : 'provider_processing_failed', `Instagram reported the media container ${status}`, {})
    return outcome(context, 'failed', { code: status === 'EXPIRED' ? 'container_expired' : 'provider_processing_failed', message: `Instagram reported the media container ${status}; publish again to prepare new ones` })
  }
  const carousel = post.media.length > 1
  if (carousel) {
    handles.children ??= []
    for (const [index, item] of post.media.entries()) {
      if (handles.children[index]) continue
      handles.children[index] = await createMediaContainer(target, item.kind === 'image'
        ? { kind: 'image', url: item.public_url, carouselItem: true, altText: item.alt_text }
        : { kind: 'video', url: item.public_url, carouselItem: true }, deadline)
      await fence.saveHandles(handles)
    }
    for (const child of handles.children) {
      const status = await containerReady(target, child, deadline)
      if (status !== 'FINISHED') return await notReady(status)
    }
  }
  if (!handles.container_id) {
    const only = post.media[0]!
    handles.container_id = await createMediaContainer(target, carousel
      ? { kind: 'carousel', children: handles.children!, caption: context.caption }
      : only.kind === 'image'
        ? { kind: 'image', url: only.public_url, caption: context.caption, carouselItem: false, altText: only.alt_text }
        : { kind: 'video', url: only.public_url, caption: context.caption, carouselItem: false, coverUrl: only.thumbnail_url }, deadline)
    await fence.saveHandles(handles)
  }
  const status = await containerReady(target, handles.container_id, deadline)
  if (status === 'PUBLISHED') {
    // Only a container this publication saved can report its own publication.
    await fence.published({ providerPostId: null, permalink: null, publishedAt: nowIso(), handles })
    return outcome(context, 'published', { public_url: null })
  }
  if (status !== 'FINISHED') return await notReady(status)
  const deferred = await deferFinalWithoutTime(context, fence)
  if (deferred) return deferred
  await fence.beginFinal()
  let mediaId: string | null = null
  return await finalize(context, async () => { mediaId = await publishContainer(target, handles.container_id!, deadline); return mediaId }, async () => {
    if (mediaId) {
      const media = await readMedia(target, mediaId, deadline)
      return { published: true, providerPostId: media.id, permalink: media.permalink ?? null, publishedAt: media.timestamp }
    }
    const read = await readContainerStatus(target, handles.container_id!, deadline)
    return { published: read.status === 'PUBLISHED', providerPostId: null, permalink: null, retryable: read.status === 'FINISHED' }
  })
}

/**
 * The irreversible call and what is known after it. A confirmed call is
 * published. Anything else re-reads the same object: published is published;
 * a definite "not published" may repeat the call on that same object, once;
 * a read that also fails is `unknown`, for reconcile_post_publication.
 */
async function finalize(
  context: ChannelContext,
  call: () => Promise<string | null>,
  read: () => Promise<{ published: boolean; providerPostId: string | null; permalink: string | null; publishedAt?: string | null; retryable?: boolean; createsAnother?: boolean }>,
): Promise<ChannelResult> {
  const fence = claimed(context.db, context.publication.id, context.attemptId)
  let callError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    callError = null
    let confirmedId: string | null = null
    try { confirmedId = await call() } catch (error) { callError = error }
    let state
    try {
      state = await read()
    } catch (readError) {
      if (callError === null) {
        // The call was confirmed; only its details could not be read back.
        await fence.published({ providerPostId: confirmedId, permalink: null, publishedAt: nowIso(), handles: context.handles })
        return outcome(context, 'published', { public_url: null, code: 'details_unavailable', message: messageOf(readError) })
      }
      if (callError instanceof MetaGraphError && callError.failure !== 'transport') {
        // Meta answered the final call with an error: it did not take effect.
        const failure = failureOf(callError)
        await fence.failed(failure.code, failure.message, context.handles)
        return outcome(context, 'failed', failure)
      }
      const message = `The final ${context.publication.channel} call was not confirmed (${messageOf(callError)}) and the post could not be read back (${messageOf(readError)}). Reconcile it; it is not sent again.`
      await fence.unknown('final_unconfirmed', message)
      return outcome(context, 'unknown', { code: 'final_unconfirmed', message })
    }
    if (state.published) {
      const publishedAt = instantOf(state.publishedAt)
      await fence.published({ providerPostId: state.providerPostId, permalink: state.permalink, publishedAt, handles: context.handles })
      return outcome(context, 'published', { public_url: validPermalink(state.permalink) })
    }
    if (callError instanceof MetaGraphError && callError.failure !== 'transport') {
      // Meta refused the call, and the object reads as not published.
      const failure = failureOf(callError)
      await fence.failed(failure.code, failure.message, context.handles)
      return outcome(context, 'failed', failure)
    }
    if (state.createsAnother) {
      // The call created a post that does not read as published, and calling
      // again would create another: only reconciliation may say what it is.
      const message = `${context.publication.channel} answered the final call with ${state.providerPostId ?? 'an object'} that does not read as published. Reconcile it; it is not sent again.`
      await fence.unknown('final_unconfirmed', message)
      return outcome(context, 'unknown', { code: 'final_unconfirmed', message })
    }
    if (!state.retryable || context.deadline.remaining() < 5_000) break
  }
  // Not published, and not refused: the same object is still ready for its final call.
  await fence.release(['publishing'])
  return outcome(context, 'processing', { code: 'final_not_confirmed', message: `${context.publication.channel} did not confirm the final call and still reads as unpublished. Call publish_post again; it finishes this same post.${callError ? ` (${messageOf(callError)})` : ''}` })
}

/** Unpublished objects this publication created for a payload it no longer sends. */
async function discardPreparation(env: CloudflareEnv, organizationId: string, publication: PublicationRecord, deadline: MetaDeadline): Promise<void> {
  const handles = JSON.parse(publication.provider_handles_json) as Handles
  if (publication.channel !== 'facebook') return // Instagram expires an unpublished container itself; it offers no delete.
  const ids = [handles.post_id, handles.video_id, ...(handles.photo_ids ?? [])].filter((id): id is string => Boolean(id))
  if (!ids.length) return
  const target = await facebookTargetFor(env, organizationId)
  for (const id of ids) await deleteUnpublishedObject(target, id, deadline)
}

/** Claims the publication row for this invocation, or says why it cannot. */
async function claimPublication(
  db: DbClient, env: CloudflareEnv, organizationId: string, post: Post,
  target: Extract<PublishTarget, { channel: SocialChannel }>, identity: { appId: string; subjectId: string }, payloadHash: string, deadline: MetaDeadline,
): Promise<{ publication: PublicationRecord; attemptId: string } | PublishOutcome> {
  const attemptId = crypto.randomUUID()
  const existing = await readPublication(db, organizationId, { postId: post.id, channel: target.channel })
  if (!existing) {
    const id = crypto.randomUUID()
    try {
      // A batch, so the unique index's refusal reaches here as D1 states it.
      await executeBatch(db, [{ query: `INSERT INTO post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id, provider_target_id,
          origin, state, payload_hash, attempt_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'publish', 'preparing', ?, ?, ?, ?)`,
      params: [id, organizationId, post.id, target.channel, identity.appId, identity.subjectId, target.target_id, payloadHash, attemptId, nowIso(), nowIso()] }])
    } catch (error) {
      if (!/UNIQUE constraint failed/.test(messageOf(error))) throw error
      // A concurrent call claimed it first; it does the work.
      return { channel: target.channel, target_id: target.target_id, status: 'processing', code: 'in_progress', message: 'Another call is publishing this post to this channel' }
    }
    return { publication: (await readPublication(db, organizationId, { id }))!, attemptId }
  }
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
  if (existing.state === 'failed' && existing.payload_hash !== payloadHash) {
    // What was prepared belongs to a payload this call no longer sends.
    try { await discardPreparation(env, organizationId, existing, deadline) } catch (error) {
      return { channel: target.channel, target_id: target.target_id, status: 'failed', publication_id: existing.id, code: 'cleanup_failed',
        message: `The unpublished objects of the earlier attempt could not be removed, so nothing new was prepared: ${messageOf(error)}` }
    }
  }
  const reclaim = await execute(db, `UPDATE post_publications SET state = 'preparing', attempt_id = ?, payload_hash = ?, error_code = NULL, error_message = NULL,
      provider_handles_json = CASE WHEN state = 'failed' AND payload_hash IS NOT ? THEN '{}' ELSE provider_handles_json END,
      provider_post_id = CASE WHEN state = 'failed' AND payload_hash IS NOT ? THEN NULL ELSE provider_post_id END, updated_at = ?
    WHERE id = ? AND updated_at = ? AND (state = 'failed' OR (state = 'preparing' AND (attempt_id IS NULL OR updated_at < ?)))`,
  [attemptId, payloadHash, payloadHash, payloadHash, nowIso(), existing.id, existing.updated_at, staleBefore])
  if (Number(reclaim.meta?.changes ?? 0) !== 1) {
    return { channel: target.channel, target_id: target.target_id, status: 'processing', publication_id: existing.id, code: 'in_progress', message: 'Another call is publishing this post to this channel' }
  }
  return { publication: (await readPublication(db, organizationId, { id: existing.id }))!, attemptId }
}

async function publishExternal(
  db: DbClient, env: CloudflareEnv, organizationId: string, post: Post,
  target: Extract<PublishTarget, { channel: SocialChannel }>, deadline: MetaDeadline,
): Promise<PublishOutcome> {
  const connection = await readConnection(env, organizationId, target.channel)
  const account = connection.accountId ? await readLinkedAccount(env, connection.accountId) : null
  if (!account) return { channel: target.channel, target_id: target.target_id, status: 'skipped', code: 'account_unlinked', message: `The ${target.channel} account behind this connection is no longer linked. Connect it again.` }
  const appId = target.channel === 'facebook' ? env.FACEBOOK_APP_ID : env.INSTAGRAM_APP_ID
  if (typeof appId !== 'string' || !appId) throw new Error(`${target.channel === 'facebook' ? 'FACEBOOK_APP_ID' : 'INSTAGRAM_APP_ID'} is not configured`)
  const payloadHash = await postPayloadFingerprint(post, { channel: target.channel, target_id: target.target_id })
  const claim = await claimPublication(db, env, organizationId, post, target, { appId, subjectId: account.providerAccountId }, payloadHash, deadline)
  if (!('attemptId' in claim)) return claim
  const context: ChannelContext = {
    db, env, organizationId, post, caption: providerCaption(post.body, post.call_to_action), publication: claim.publication,
    attemptId: claim.attemptId, handles: JSON.parse(claim.publication.provider_handles_json) as Handles, deadline,
  }
  const fence = claimed(db, claim.publication.id, claim.attemptId)
  try {
    return target.channel === 'facebook'
      ? await publishToFacebook(context, await facebookTargetFor(env, organizationId))
      : await publishToInstagram(context, await instagramTargetFor(env, organizationId))
  } catch (error) {
    if (error instanceof ClaimLost) return outcome(context, 'processing', { code: 'claim_lost', message: error.message })
    // Before the final call nothing can be public, so this is a definite
    // non-publication; the objects already prepared stay saved for the retry.
    const failure = failureOf(error)
    const current = await readPublication(db, organizationId, { id: claim.publication.id })
    if (current?.state === 'publishing' && current.attempt_id === claim.attemptId) {
      await fence.unknown('final_unconfirmed', `The publication stopped after its final call began: ${failure.message}`)
      return outcome(context, 'unknown', { code: 'final_unconfirmed', message: failure.message })
    }
    await fence.failed(failure.code, failure.message, context.handles)
    return outcome(context, 'failed', failure)
  }
}

/** A receipt for a publication that already exists, read without changing anything. */
function receipt(publication: PublicationRecord): PublishOutcome {
  const base = { channel: publication.channel, target_id: publication.provider_target_id, publication_id: publication.id }
  if (publication.state === 'published') return { ...base, status: 'already_published', public_url: publication.provider_permalink }
  if (publication.state === 'unknown') return { ...base, status: 'unknown', code: publication.error_code ?? 'unresolved', message: `${publication.error_message ?? 'The outcome of this publication is unresolved.'} Resolve it with reconcile_post_publication.` }
  if (publication.state === 'removed') return { ...base, status: 'failed', code: 'removed', message: `The ${publication.channel} post was removed. Create a new post to publish again.` }
  return { ...base, status: 'processing', code: 'in_progress', message: 'This publication is being prepared by another call' }
}

/**
 * Publishes one post to the targets the caller named, and nothing else.
 *
 * Existing results are read first, so a repeat returns the same receipts
 * without needing a fresh revision. A new target, or a first website
 * publication, needs the caller's current `expected_updated_at` and the
 * connection revision it read. Every target is evaluated; `ok` is true only
 * when all of them are published.
 */
export async function publishPost(
  env: CloudflareEnv,
  organizationId: string,
  postId: string,
  input: { expectedUpdatedAt: string; targets: PublishTarget[] },
  actorId: string | null,
): Promise<PublishResult> {
  const db = env.DB as DbClient
  const deadline = new MetaDeadline(PUBLISH_BUDGET_MS)
  const post = await getPost(db, env, organizationId, postId)
  if (!post) throw new HTTPError({ statusCode: 404, statusMessage: 'Post not found' })
  const stale = post.updated_at !== input.expectedUpdatedAt
  const staleOutcome = (channel: PublishOutcome['channel'], targetId: string): PublishOutcome => ({ channel, target_id: targetId, status: 'failed', code: 'stale_revision',
    message: `The post changed since it was read (now ${post.updated_at}); read it again and publish with the current expected_updated_at` })
  const assets = await assetFacts(db, organizationId, post.media)
  const caption = providerCaption(post.body, post.call_to_action)
  const entitled = await hasOrganizationEntitlement(env, organizationId, 'managed_service')
  const outcomes: PublishOutcome[] = []
  const external: Array<Extract<PublishTarget, { channel: SocialChannel }>> = []
  let publishWebsite = false

  for (const target of input.targets) {
    if (target.channel === 'organization') {
      if (post.status === 'published') outcomes.push({ channel: 'organization', target_id: organizationId, status: 'already_published', public_url: post.canonical_url })
      else if (stale) outcomes.push(staleOutcome('organization', organizationId))
      else if (!publishable(post)) outcomes.push({ channel: 'organization', target_id: organizationId, status: 'failed', code: 'empty_post', message: 'A post needs words, media or a call to action before it can be published' })
      else publishWebsite = true
      continue
    }
    const existing = post.publications.find(publication => publication.channel === target.channel)
    let record = existing ? await readPublication(db, organizationId, { id: existing.id }) : null
    // An invocation that died after its final call began left `publishing`
    // behind; once its claim is stale that is an unconfirmed final call, and
    // only reconciliation may say what became of it.
    if (record?.state === 'publishing' && Date.parse(record.updated_at) < Date.now() - CLAIM_STALE_MS) {
      await execute(db, `UPDATE post_publications SET state = 'unknown', attempt_id = NULL, error_code = 'final_unconfirmed',
          error_message = 'The call that was publishing this stopped before it confirmed the result', updated_at = ?
        WHERE id = ? AND state = 'publishing' AND updated_at = ?`, [nowIso(), record.id, record.updated_at])
      record = await readPublication(db, organizationId, { id: record.id })
    }
    if (record && record.provider_target_id !== target.target_id) {
      outcomes.push({ channel: target.channel, target_id: target.target_id, status: 'failed', publication_id: record.id, code: 'target_conflict',
        message: `This post's ${target.channel} publication is to ${record.provider_target_id}; a post is published to one ${target.channel} target. Create a new post for another.` })
      continue
    }
    if (record && record.state !== 'failed' && !(record.state === 'preparing' && record.attempt_id === null) && !(record.state === 'preparing' && Date.parse(record.updated_at) < Date.now() - CLAIM_STALE_MS)) {
      outcomes.push(receipt(record))
      continue
    }
    const resuming = record?.state === 'preparing'
    const connection = await readConnection(env, organizationId, target.channel)
    if (!entitled) { outcomes.push({ channel: target.channel, target_id: target.target_id, status: 'skipped', code: 'growth_plan_required', message: 'Publishing to Facebook and Instagram requires the Growth plan.' }); continue }
    if (!connection.connected) { outcomes.push({ channel: target.channel, target_id: target.target_id, status: 'skipped', code: 'not_connected', message: `No ${target.channel} account is connected.` }); continue }
    if (connection.targetId !== target.target_id || connection.revision !== target.connection_revision) {
      outcomes.push({ channel: target.channel, target_id: target.target_id, status: 'failed', code: 'connection_changed',
        message: `The ${target.channel} connection is now ${connection.targetName ?? connection.targetId} at revision ${connection.revision}; read get_social_connections again` })
      continue
    }
    // A resumed preparation sends the payload it pinned; it needs no fresh content revision.
    if (stale && !resuming) { outcomes.push(staleOutcome(target.channel, target.target_id)); continue }
    if (!publishable(post)) { outcomes.push({ channel: target.channel, target_id: target.target_id, status: 'failed', code: 'empty_post', message: 'A post needs words, media or a call to action before it can be published' }); continue }
    const violation = formatViolation(target.channel, caption, assets)
    if (violation) { outcomes.push({ channel: target.channel, target_id: target.target_id, status: 'failed', ...violation }); continue }
    external.push(target)
  }

  if (publishWebsite) {
    const now = new Date(Math.max(Date.now(), Date.parse(post.updated_at) + 1)).toISOString()
    const [result] = await executeBatch(db, [{
      query: `UPDATE content_documents SET status = 'published', published_at = COALESCE(published_at, ?), first_published_at = COALESCE(first_published_at, ?), updated_at = ?
        WHERE kind = 'social_post' AND row_role = 'root' AND id = ? AND organization_id = ? AND updated_at = ? AND status = 'draft'`,
      params: [now, now, now, postId, organizationId, input.expectedUpdatedAt],
    }, organizationEventQuery({ organizationId, locationId: post.location_id, actorId, eventType: 'post.published', entityType: 'post', entityId: postId,
      metadata: { channel: 'organization' }, onlyIfPreviousChangedOneRow: true }),
    publicResourceCacheInvalidationQuery(organizationId, 'post-publish')])
    if (Number(result?.meta.changes ?? 0) === 1) {
      const published = await getPost(db, env, organizationId, postId)
      outcomes.push({ channel: 'organization', target_id: organizationId, status: 'published', public_url: published?.canonical_url ?? null })
    } else {
      outcomes.push(staleOutcome('organization', organizationId))
    }
  }
  for (const target of external) outcomes.push(await publishExternal(db, env, organizationId, post, target, deadline))

  const order = input.targets.map(target => target.channel)
  outcomes.sort((a, b) => order.indexOf(a.channel) - order.indexOf(b.channel))
  const current = await queryFirst<{ updated_at: string }>(db, 'SELECT updated_at FROM content_documents WHERE id = ?', [postId])
  return {
    ok: outcomes.length === input.targets.length && outcomes.every(item => item.status === 'published' || item.status === 'already_published'),
    post_id: postId,
    updated_at: current?.updated_at ?? post.updated_at,
    outcomes,
  }
}

// ── Reconciliation ────────────────────────────────────────────────────────

/**
 * Reads the provider for one publication and records what it proves. It never
 * publishes, and it takes no one's word that something is published: a
 * supplied `provider_post_id` is read and must belong to this publication's
 * target. What stays ambiguous stays `unknown`.
 */
export async function reconcilePostPublication(env: CloudflareEnv, organizationId: string, publicationId: string, providerPostId: string | null) {
  const db = env.DB as DbClient
  const publication = await readPublication(db, organizationId, { id: publicationId })
  if (!publication) throw new HTTPError({ statusCode: 404, statusMessage: 'Publication not found' })
  if (providerPostId && publication.provider_post_id && providerPostId !== publication.provider_post_id) {
    throw new HTTPError({ statusCode: 409, statusMessage: `This publication is ${publication.provider_post_id}; ${providerPostId} is a different ${publication.channel} post` })
  }
  const connection = await readConnection(env, organizationId, publication.channel)
  const account = connection.accountId ? await readLinkedAccount(env, connection.accountId) : null
  const appId = publication.channel === 'facebook' ? env.FACEBOOK_APP_ID : env.INSTAGRAM_APP_ID
  if (!connection.connected || connection.targetId !== publication.provider_target_id || !account
    || account.providerAccountId !== publication.provider_subject_id || appId !== publication.provider_app_id) {
    throw new HTTPError({ statusCode: 409, statusMessage: `Reconciling needs the ${publication.channel} connection that made this publication (target ${publication.provider_target_id}); it is not connected now` })
  }
  const deadline = new MetaDeadline(PUBLISH_BUDGET_MS)
  const handles = JSON.parse(publication.provider_handles_json) as Handles
  const record = async (state: 'published' | 'preparing' | 'failed', fields: { providerPostId?: string | null; permalink?: string | null; publishedAt?: string | null; code?: string; message?: string }) => {
    const result = await execute(db, `UPDATE post_publications SET state = ?, attempt_id = NULL, provider_post_id = COALESCE(?, provider_post_id),
        provider_permalink = COALESCE(?, provider_permalink), published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END,
        error_code = ?, error_message = ?, updated_at = ?
      WHERE id = ? AND updated_at = ?`,
    [state, fields.providerPostId ?? null, validPermalink(fields.permalink ?? null), state, instantOf(fields.publishedAt),
      state === 'failed' ? fields.code ?? 'provider_rejected' : null, state === 'failed' ? fields.message ?? null : null, nowIso(), publication.id, publication.updated_at])
    if (Number(result.meta?.changes ?? 0) !== 1) throw new HTTPError({ statusCode: 409, statusMessage: 'The publication changed while it was being reconciled; read it again' })
  }
  if (publication.channel === 'facebook') {
    const target = await facebookTargetFor(env, organizationId)
    const postId = providerPostId ?? publication.provider_post_id ?? handles.post_id ?? null
    if (postId) {
      if (!postId.startsWith(`${target.pageId}_`) && postId !== handles.video_id) throw new HTTPError({ statusCode: 409, statusMessage: `${postId} is not a post of the Page ${target.pageId}` })
      const read = await readPagePost(target, postId, deadline)
      if (read.isPublished) await record('published', { providerPostId: read.id, permalink: read.permalink, publishedAt: read.createdTime })
      else await record('preparing', { providerPostId: read.id })
    } else if (handles.video_id) {
      const read = await readVideo(target, handles.video_id, deadline)
      if (read.published) await record('published', { providerPostId: read.postId ?? handles.video_id, permalink: read.permalink })
      else if (read.processing === 'error') await record('failed', { code: 'provider_processing_failed', message: read.error ?? undefined })
      else await record('preparing', {})
    }
  } else {
    const target = await instagramTargetFor(env, organizationId)
    const mediaId = providerPostId ?? publication.provider_post_id
    if (mediaId) {
      const media = await readMedia(target, mediaId, deadline)
      const username = (await readInstagramConnection(env, organizationId))?.username ?? null
      if (!username || media.username !== username) throw new HTTPError({ statusCode: 409, statusMessage: `${media.id} belongs to @${media.username ?? 'another account'}, not @${username}` })
      await record('published', { providerPostId: media.id, permalink: media.permalink ?? null, publishedAt: media.timestamp })
    } else if (handles.container_id) {
      const { status } = await readContainerStatus(target, handles.container_id, deadline)
      if (status === 'PUBLISHED') await record('published', {})
      else if (status === 'FINISHED' || status === 'IN_PROGRESS') await record('preparing', {})
      else await record('failed', { code: status === 'EXPIRED' ? 'container_expired' : 'provider_processing_failed', message: `Instagram reported the media container ${status}` })
    }
  }
  const updated = await readPublication(db, organizationId, { id: publicationId })
  return { publication: updated ? receipt(updated) : null, state: updated?.state ?? null }
}
