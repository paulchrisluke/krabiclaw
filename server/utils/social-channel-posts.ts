import { HTTPError } from 'nitro'
import { executeBatch, queryFirst } from '~/server/db'
import type { CloudflareEnv } from './auth'
import { deletePageObject, listPagePosts, readPagePostRecord, type FacebookAttachment, type FacebookPagePostRecord } from './facebook-pages'
import { listMedia, readMedia, type InstagramMediaRecord } from './instagram'
import { MetaDeadline, MetaGraphError } from './meta-graph'
import { organizationEventQuery } from './organization-events'
import { publicResourceCacheInvalidationQuery } from './public-resource-cache'
import { connectedSocialTarget, parsePublishTargets, type PublishTarget, type SocialChannel } from './social-publication'

type ChannelTarget = Extract<PublishTarget, { channel: SocialChannel }>
export function parseChannelTarget(args: Record<string, unknown>): ChannelTarget {
  const target = parsePublishTargets([{ channel: args.channel, target_id: args.target_id, connection_revision: args.connection_revision }])[0]!
  if (target.channel === 'organization') throw new HTTPError({ statusCode: 400, statusMessage: 'Use website post tools for the organization channel.' })
  return target
}

export interface ChannelPost {
  channel: SocialChannel
  target_id: string
  provider_post_id: string
  body: string | null
  public_url: string | null
  published_at: string
  media: Array<{ provider_media_id: string | null; kind: 'image' | 'video'; public_url: string | null; thumbnail_url: string | null }>
}

function timestamp(value: string): string {
  const parsed = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  if (!Number.isFinite(parsed)) throw new Error('The provider post has no valid publication timestamp')
  return new Date(parsed).toISOString()
}

function facebookMedia(attachment: FacebookAttachment): ChannelPost['media'] {
  if (attachment.subattachments?.data?.length) return attachment.subattachments.data.flatMap(facebookMedia)
  const type = attachment.media_type ?? attachment.type ?? ''
  if (type.startsWith('video')) return [{ provider_media_id: attachment.target?.id ?? null, kind: 'video', public_url: attachment.media?.source ?? null, thumbnail_url: attachment.media?.image?.src ?? null }]
  if (['photo', 'cover_photo', 'profile_media'].includes(type)) return [{ provider_media_id: attachment.target?.id ?? null, kind: 'image', public_url: attachment.media?.image?.src ?? null, thumbnail_url: null }]
  return []
}
function facebookPost(record: FacebookPagePostRecord, targetId: string): ChannelPost {
  if (!record.id.startsWith(`${targetId}_`)) throw new HTTPError({ statusCode: 409, statusMessage: 'The post does not belong to the selected Facebook Page.' })
  return { channel: 'facebook', target_id: targetId, provider_post_id: record.id, body: record.message ?? null,
    public_url: record.permalink_url ?? null, published_at: timestamp(record.created_time), media: (record.attachments?.data ?? []).flatMap(facebookMedia) }
}
function instagramPost(record: InstagramMediaRecord, targetId: string, username: string): ChannelPost {
  if (record.username !== username) throw new HTTPError({ statusCode: 409, statusMessage: 'The media does not belong to the selected Instagram account.' })
  const items = record.media_type === 'CAROUSEL_ALBUM' ? record.children?.data : [record]
  if (!items?.length) throw new Error('Instagram returned media without its carousel items')
  return { channel: 'instagram', target_id: targetId, provider_post_id: record.id, body: record.caption ?? null,
    public_url: record.permalink ?? null, published_at: timestamp(record.timestamp), media: items.map(item => ({
      provider_media_id: item.id, kind: item.media_type === 'VIDEO' ? 'video' : 'image', public_url: item.media_url ?? null, thumbnail_url: item.thumbnail_url ?? null,
    })) }
}

/** Read provider inventory without importing documents, media or progress state. */
export async function listChannelPosts(env: CloudflareEnv, organizationId: string, input: ChannelTarget, page: { after: string | null; limit: number }) {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100) throw new HTTPError({ statusCode: 400, statusMessage: 'limit must be an integer between 1 and 100' })
  const connection = await connectedSocialTarget(env, organizationId, input)
  const deadline = new MetaDeadline(30_000)
  if (connection.channel === 'facebook') {
    const result = await listPagePosts(connection.target, page, deadline)
    return { posts: result.items.map(item => facebookPost(item, input.target_id)), next_after: result.after }
  }
  const result = await listMedia(connection.target, page, deadline)
  return { posts: result.items.map(item => instagramPost(item, input.target_id, connection.username)), next_after: result.after }
}

export async function getChannelPost(env: CloudflareEnv, organizationId: string, input: ChannelTarget, providerPostId: string): Promise<ChannelPost> {
  const connection = await connectedSocialTarget(env, organizationId, input)
  const deadline = new MetaDeadline(30_000)
  if (connection.channel === 'facebook') {
    if (!providerPostId.startsWith(`${input.target_id}_`)) throw new HTTPError({ statusCode: 400, statusMessage: 'provider_post_id must belong to the explicitly selected Page.' })
    return facebookPost(await readPagePostRecord(connection.target, providerPostId, deadline), input.target_id)
  }
  return instagramPost(await readMedia(connection.target, providerPostId, deadline), input.target_id, connection.username)
}

/** Explicit channel deletion retains website content and the publication receipt. */
export async function deleteChannelPost(env: CloudflareEnv, organizationId: string, input: ChannelTarget, providerPostId: string, actorId: string) {
  if (input.channel === 'instagram') throw new HTTPError({ statusCode: 400, statusMessage: 'Meta media deletion requires Facebook Login. This connection uses Instagram Login; delete the post in Instagram.' })
  const connection = await connectedSocialTarget(env, organizationId, input)
  if (connection.channel !== 'facebook') throw new Error('The selected channel changed')
  if (!providerPostId.startsWith(`${input.target_id}_`)) throw new HTTPError({ statusCode: 400, statusMessage: 'provider_post_id must belong to the explicitly selected Page.' })
  const previous = await queryFirst<{ id: string; state: string }>(env.DB, `SELECT id, state FROM post_publications WHERE organization_id = ? AND channel = 'facebook' AND provider_target_id = ? AND provider_post_id = ?`, [organizationId, input.target_id, providerPostId])
  if (previous?.state === 'removed') return { channel: input.channel, target_id: input.target_id, provider_post_id: providerPostId, deleted: true, publication: previous }
  if (previous && previous.state !== 'published') throw new HTTPError({ statusCode: 409, statusMessage: 'Resolve the existing publication before deleting its provider post.' })
  const deadline = new MetaDeadline(30_000)
  try {
    facebookPost(await readPagePostRecord(connection.target, providerPostId, deadline), input.target_id)
    await deletePageObject(connection.target, providerPostId, deadline)
  } catch (error) {
    if (!(error instanceof MetaGraphError && error.objectMissing && previous?.state === 'published')) throw error
  }
  const now = new Date().toISOString()
  await executeBatch(env.DB, [
    { query: `UPDATE post_publications SET state = 'removed', attempt_id = NULL, error_code = NULL, error_message = NULL, updated_at = ?
        WHERE organization_id = ? AND channel = 'facebook' AND provider_target_id = ? AND provider_post_id = ? AND state IN ('published','removed')`,
      params: [now, organizationId, input.target_id, providerPostId] },
    organizationEventQuery({ organizationId, actorId, eventType: 'post.channel_deleted', entityType: 'post', entityId: providerPostId, metadata: { channel: input.channel, target_id: input.target_id } }),
    publicResourceCacheInvalidationQuery(organizationId, 'channel-post-deleted'),
  ])
  const publication = await queryFirst<{ id: string; state: string }>(env.DB, `SELECT id, state FROM post_publications WHERE organization_id = ? AND channel = 'facebook' AND provider_target_id = ? AND provider_post_id = ?`, [organizationId, input.target_id, providerPostId])
  if (publication && publication.state !== 'removed') throw new HTTPError({ statusCode: 409, statusMessage: 'Meta deleted the post, but its publication changed. Read its receipt before continuing.' })
  return { channel: input.channel, target_id: input.target_id, provider_post_id: providerPostId, deleted: true, publication }
}
