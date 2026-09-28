import type { FacebookIntegration, SocialSyncProgress } from '~/shared/organization-settings'
import { execute, queryFirst } from '~/server/db'
import { linkedAccountAccessToken, type CloudflareEnv } from './auth'
import { formBody, metaGraphRequest, type MetaDeadline } from './meta-graph'

/**
 * A Facebook Page as an organization's integration, and the Page Graph calls
 * publication and sync make through it.
 *
 * The Facebook identity and its user token are a Better Auth linked account;
 * the organization stores which of those accounts it acts through and which
 * Page it chose. A Page token is never stored: it is read from the Pages the
 * linked account manages each time one is needed, so a Page the account stops
 * managing stops working rather than carrying on with a copied credential.
 *
 * The API version is pinned. The primitives are Meta's own: an unpublished
 * photo, an unpublished Page post that attaches them, `is_published` on that
 * same post; an unpublished video, its processing status, `published` on that
 * same video.
 */

const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface FacebookPagesConnection extends FacebookIntegration {
  organization_id: string
  sync: SocialSyncProgress | null
}

export interface FacebookPage {
  id: string
  name: string
  access_token: string
  category?: string
  fan_count?: number
  picture?: { data: { url: string } }
}

export interface FacebookPageTarget {
  pageId: string
  pageToken: string
}

type GraphInit = RequestInit & { deadline?: MetaDeadline }

const authorized = (target: FacebookPageTarget, init: GraphInit = {}): GraphInit => ({
  ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${target.pageToken}` },
})

export const storeFacebookPagesConnection = async (
  env: CloudflareEnv,
  connection: { organization_id: string; account_id: string; page_id: string; page_name: string },
  expected: { revision: string | null },
): Promise<void> => {
  const now = new Date().toISOString()
  // A new selection is a new revision, and its sync starts from the head: the
  // progress below belongs to the Page it was made for.
  const payload = JSON.stringify({
    revision: crypto.randomUUID(),
    account_id: connection.account_id,
    page_id: connection.page_id,
    page_name: connection.page_name,
    status: 'active',
    created_at: now,
    updated_at: now,
  })
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.facebook',
      json_set(json(?),
        '$.created_at', COALESCE(json_extract(integrations_json, '$.facebook.created_at'), ?)))
    WHERE id = ?
      AND json_extract(integrations_json, '$.facebook.revision') IS ?
  `, [payload, now, connection.organization_id, expected.revision])
  if (result.meta?.changes !== 1) throw new Error('The Facebook connection changed. Reload before saving.')
}

export const getFacebookPagesConnection = async (
  env: CloudflareEnv,
  organizationId: string,
): Promise<FacebookPagesConnection | null> => {
  const row = await queryFirst<Omit<FacebookPagesConnection, 'sync'> & { sync: string | null }>(env.DB, `
    SELECT id AS organization_id,
           json_extract(integrations_json, '$.facebook.revision') AS revision,
           json_extract(integrations_json, '$.facebook.account_id') AS account_id,
           json_extract(integrations_json, '$.facebook.page_id') AS page_id,
           json_extract(integrations_json, '$.facebook.page_name') AS page_name,
           json_extract(integrations_json, '$.facebook.status') AS status,
           json_extract(integrations_json, '$.facebook.created_at') AS created_at,
           json_extract(integrations_json, '$.facebook.updated_at') AS updated_at,
           json_extract(integrations_json, '$.facebook.sync') AS sync
      FROM organization WHERE id = ?
       AND json_extract(integrations_json, '$.facebook.status') IN ('active', 'error')
     LIMIT 1
  `, [organizationId])
  return row ? { ...row, sync: row.sync ? JSON.parse(row.sync) as SocialSyncProgress : null } : null
}

/** The Pages a linked Facebook account manages, each with its Page token. */
export const listLinkedFacebookPages = async (env: CloudflareEnv, accountId: string): Promise<FacebookPage[]> => {
  const token = (await linkedAccountAccessToken(env, accountId)).accessToken
  const pages: FacebookPage[] = []
  let after: string | null = null
  // A person who manages more Pages than one response holds manages all of
  // them; the list follows Meta's cursor to its end.
  do {
    const params = new URLSearchParams({ fields: 'id,name,access_token,category,fan_count,picture', limit: '100', ...(after ? { after } : {}) })
    const page: { data?: FacebookPage[]; paging?: { cursors?: { after?: string }; next?: string } } = await metaGraphRequest(
      `${GRAPH_BASE}/me/accounts?${params}`, { headers: { authorization: `Bearer ${token}` } })
    pages.push(...(page.data ?? []))
    after = page.paging?.next ? page.paging.cursors?.after ?? null : null
  } while (after)
  return pages
}

/** The connected Page's token, read through the linked account that manages it. */
export const facebookPageToken = async (env: CloudflareEnv, connection: Pick<FacebookPagesConnection, 'account_id' | 'page_id' | 'page_name'>): Promise<string> => {
  const page = (await listLinkedFacebookPages(env, connection.account_id)).find(candidate => candidate.id === connection.page_id)
  if (!page) throw new Error(`The linked Facebook account no longer manages the Page ${connection.page_name}. Connect Facebook again.`)
  return page.access_token
}

// ── Publication primitives ────────────────────────────────────────────────

/** An unpublished photo on the Page, for a post to attach. Facebook fetches `url` itself. */
export async function createUnpublishedPhoto(target: FacebookPageTarget, input: { url: string; altText: string | null }, deadline: MetaDeadline): Promise<string> {
  const result = await metaGraphRequest<{ id?: string }>(`${GRAPH_BASE}/${target.pageId}/photos`, authorized(target, {
    ...formBody({ url: input.url, published: false, ...(input.altText ? { alt_text_custom: input.altText } : {}) }), deadline,
  }))
  if (!result.id) throw new Error('Facebook created no photo')
  return result.id
}

/**
 * An unpublished Page post: the text, a native link when there is no media, and
 * the attached photos in the author's order. It has its final identity already;
 * `publishPagePost` publishes this same object.
 */
export async function createUnpublishedPagePost(target: FacebookPageTarget, input: { message: string; link: string | null; photoIds: readonly string[] }, deadline: MetaDeadline): Promise<string> {
  const fields: Record<string, string | boolean> = { published: false }
  if (input.message) fields.message = input.message
  if (input.link && input.photoIds.length === 0) fields.link = input.link
  input.photoIds.forEach((id, index) => { fields[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id }) })
  const result = await metaGraphRequest<{ id?: string }>(`${GRAPH_BASE}/${target.pageId}/feed`, authorized(target, { ...formBody(fields), deadline }))
  if (!result.id) throw new Error('Facebook created no Page post')
  return result.id
}

export async function publishPagePost(target: FacebookPageTarget, postId: string, deadline: MetaDeadline): Promise<void> {
  const result = await metaGraphRequest<{ success?: boolean }>(`${GRAPH_BASE}/${postId}`, authorized(target, { ...formBody({ is_published: true }), deadline }))
  if (result.success !== true) throw new Error('Facebook did not confirm the post was published')
}

export interface FacebookPostState { id: string; isPublished: boolean; permalink: string | null; createdTime: string | null }

export async function readPagePost(target: FacebookPageTarget, postId: string, deadline: MetaDeadline): Promise<FacebookPostState> {
  const result = await metaGraphRequest<{ id?: string; is_published?: boolean; permalink_url?: string; created_time?: string }>(
    `${GRAPH_BASE}/${postId}?fields=id,is_published,permalink_url,created_time`, authorized(target, { deadline }))
  if (!result.id || typeof result.is_published !== 'boolean') throw new Error('Facebook did not say whether the post is published')
  return { id: result.id, isPublished: result.is_published, permalink: result.permalink_url ?? null, createdTime: result.created_time ?? null }
}

/** A native video, uploaded unpublished from a URL Facebook fetches. */
export async function createUnpublishedVideo(target: FacebookPageTarget, input: { fileUrl: string; description: string; title: string | null }, deadline: MetaDeadline): Promise<string> {
  const result = await metaGraphRequest<{ id?: string }>(`${GRAPH_BASE}/${target.pageId}/videos`, authorized(target, {
    ...formBody({ file_url: input.fileUrl, published: false, ...(input.description ? { description: input.description } : {}), ...(input.title ? { title: input.title } : {}) }), deadline,
  }))
  if (!result.id) throw new Error('Facebook created no video')
  return result.id
}

export interface FacebookVideoState { id: string; processing: 'ready' | 'processing' | 'error'; published: boolean; postId: string | null; permalink: string | null; error: string | null }

export async function readVideo(target: FacebookPageTarget, videoId: string, deadline: MetaDeadline): Promise<FacebookVideoState> {
  const result = await metaGraphRequest<{ id?: string; published?: boolean; post_id?: string; permalink_url?: string; status?: { video_status?: string; processing_phase?: { status?: string; errors?: Array<{ message?: string }> } } }>(
    `${GRAPH_BASE}/${videoId}?fields=id,published,post_id,permalink_url,status`, authorized(target, { deadline }))
  if (!result.id || typeof result.published !== 'boolean') throw new Error('Facebook did not say whether the video is published')
  const status = result.status?.video_status
  const processing = status === 'ready' ? 'ready' : status === 'error' ? 'error' : 'processing'
  const permalink = result.permalink_url ? new URL(result.permalink_url, 'https://www.facebook.com').toString() : null
  return { id: result.id, processing, published: result.published, postId: result.post_id ?? null, permalink,
    error: processing === 'error' ? result.status?.processing_phase?.errors?.map(error => error.message).filter(Boolean).join('; ') || 'Facebook could not process the video' : null }
}

export async function publishVideo(target: FacebookPageTarget, videoId: string, deadline: MetaDeadline): Promise<void> {
  const result = await metaGraphRequest<{ success?: boolean }>(`${GRAPH_BASE}/${videoId}`, authorized(target, { ...formBody({ published: true }), deadline }))
  if (result.success !== true) throw new Error('Facebook did not confirm the video was published')
}

/** Removes an unpublished object this app created and never published. */
export async function deleteUnpublishedObject(target: FacebookPageTarget, objectId: string, deadline: MetaDeadline): Promise<void> {
  const result = await metaGraphRequest<{ success?: boolean }>(`${GRAPH_BASE}/${objectId}`, authorized(target, { method: 'DELETE', deadline }))
  if (result.success !== true) throw new Error(`Facebook did not confirm ${objectId} was deleted`)
}

// ── Reading the Page for import ───────────────────────────────────────────

export interface FacebookAttachmentMedia { image?: { src?: string; width?: number; height?: number }; source?: string }
export interface FacebookAttachment {
  type?: string
  media_type?: string
  url?: string
  unshimmed_url?: string
  title?: string
  description?: string
  target?: { id?: string; url?: string }
  media?: FacebookAttachmentMedia
  subattachments?: { data?: FacebookAttachment[] }
}
export interface FacebookPagePostRecord {
  id: string
  message?: string
  created_time: string
  permalink_url?: string
  attachments?: { data?: FacebookAttachment[] }
}

const ATTACHMENT_FIELDS = 'type,media_type,url,unshimmed_url,title,description,target{id,url},media{image,source}'

/** One page of the Page's own posts, newest first, and Meta's cursor for the next. */
export async function listPagePosts(target: FacebookPageTarget, input: { after: string | null; limit: number }, deadline: MetaDeadline): Promise<{ items: FacebookPagePostRecord[]; after: string | null }> {
  const params = new URLSearchParams({
    fields: `id,message,created_time,permalink_url,attachments{${ATTACHMENT_FIELDS},subattachments.limit(100){${ATTACHMENT_FIELDS}}}`,
    limit: String(input.limit),
    ...(input.after ? { after: input.after } : {}),
  })
  const page = await metaGraphRequest<{ data?: FacebookPagePostRecord[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `${GRAPH_BASE}/${target.pageId}/posts?${params}`, authorized(target, { deadline }))
  return { items: page.data ?? [], after: page.paging?.next ? page.paging.cursors?.after ?? null : null }
}

/** One Page post by id, for reconciliation of an exact identity. */
export async function readPagePostRecord(target: FacebookPageTarget, postId: string, deadline: MetaDeadline): Promise<FacebookPagePostRecord> {
  const params = new URLSearchParams({ fields: `id,message,created_time,permalink_url,attachments{${ATTACHMENT_FIELDS},subattachments.limit(100){${ATTACHMENT_FIELDS}}}` })
  return await metaGraphRequest<FacebookPagePostRecord>(`${GRAPH_BASE}/${postId}?${params}`, authorized(target, { deadline }))
}

/** A video's playable source, which a Page post's attachment does not always carry. */
export async function readVideoSource(target: FacebookPageTarget, videoId: string, deadline: MetaDeadline): Promise<{ source: string; picture: string | null; length: number | null }> {
  const result = await metaGraphRequest<{ source?: string; picture?: string; length?: number }>(
    `${GRAPH_BASE}/${videoId}?fields=source,picture,length`, authorized(target, { deadline }))
  if (!result.source) throw new Error(`Facebook returned no source for video ${videoId}`)
  return { source: result.source, picture: result.picture ?? null, length: typeof result.length === 'number' ? result.length : null }
}
