import type { InstagramIntegration, SocialSyncProgress } from '~/shared/organization-settings'
import { setTokenUtil } from 'better-auth/oauth2'
import { execute, queryFirst } from '~/server/db'
import { createAuth, linkedAccountAccessToken, type CloudflareEnv } from './auth'
import { formBody, metaGraphRequest } from './meta-graph'
import type { MetaDeadline } from './meta-graph'

/**
 * Instagram as its own connection: Instagram Login for professional accounts,
 * its own record, its own disconnect — not derived from a Facebook Page.
 *
 * The Instagram identity and its token are a Better Auth linked account (the
 * Generic OAuth `instagram` provider in server/utils/auth.ts). The
 * organization stores the account it acts through and the professional
 * account publishing addresses.
 */

const INSTAGRAM_API_VERSION = 'v23.0'
const INSTAGRAM_GRAPH = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}`

export interface InstagramConnection extends InstagramIntegration {
  organization_id: string
  sync: SocialSyncProgress | null
}

/**
 * The one token operation Better Auth cannot perform. A long-lived Instagram
 * token lasts sixty days and is renewed by exchanging the token itself at
 * `refresh_access_token` with `grant_type=ig_refresh_token` — not the OAuth
 * refresh-token grant Better Auth's Generic OAuth refresh sends to a token
 * URL, and Instagram issues no refresh token for it to send. So the token is
 * read through Better Auth, renewed here inside its last week, and written
 * back to the same Better Auth account row, encrypted the way Better Auth
 * stores every token.
 */
const TOKEN_RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export async function instagramAccessToken(env: CloudflareEnv, accountId: string): Promise<string> {
  const token = await linkedAccountAccessToken(env, accountId)
  if (!token.accessTokenExpiresAt) throw new Error('The linked Instagram account has no token expiry. Connect Instagram again.')
  if (token.accessTokenExpiresAt.getTime() - Date.now() > TOKEN_RENEWAL_WINDOW_MS) return token.accessToken

  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token.accessToken })
  const response = await fetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`)
  if (!response.ok) throw new Error(`Instagram token refresh failed: ${(await response.text()).slice(0, 300)}`)
  const renewed = await longLivedToken(response)

  const context = await createAuth(env).$context
  const updated = await context.internalAdapter.updateAccount(accountId, {
    // This app's concrete options type narrows AuthContext; setTokenUtil reads only options and secretConfig.
    accessToken: await setTokenUtil(renewed.accessToken, context as unknown as Parameters<typeof setTokenUtil>[1]),
    accessTokenExpiresAt: renewed.expiresAt,
  })
  if (!updated) throw new Error('The renewed Instagram token could not be saved to its linked account.')
  return renewed.accessToken
}

async function longLivedToken(response: Response): Promise<{ accessToken: string; expiresAt: Date }> {
  const token = await response.json() as { access_token?: string; expires_in?: number }
  if (!token.access_token || typeof token.expires_in !== 'number') {
    throw new Error('Instagram did not return a long-lived access token and its lifetime')
  }
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  }
}

export async function getInstagramAccount(accessToken: string): Promise<{ id: string; username: string }> {
  const params = new URLSearchParams({ fields: 'user_id,username', access_token: accessToken })
  const response = await fetch(`${INSTAGRAM_GRAPH}/me?${params.toString()}`)
  if (!response.ok) throw new Error(`Instagram account lookup failed: ${(await response.text()).slice(0, 300)}`)

  const account = await response.json() as { user_id?: string; id?: string; username?: string }
  const id = account.user_id ?? account.id
  if (!id || !account.username) throw new Error('Instagram did not return the connected account')
  return { id: String(id), username: account.username }
}

export async function storeInstagramConnection(
  env: CloudflareEnv,
  input: { organization_id: string; account_id: string; instagram_user_id: string; username: string },
  expected: { revision: string | null },
): Promise<void> {
  const now = new Date().toISOString()
  const payload = JSON.stringify({
    revision: crypto.randomUUID(),
    account_id: input.account_id,
    instagram_user_id: input.instagram_user_id,
    username: input.username,
    status: 'active',
    created_at: now,
    updated_at: now,
  })
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.instagram',
      json_set(json(?), '$.created_at', COALESCE(json_extract(integrations_json, '$.instagram.created_at'), ?)))
    WHERE id = ?
      AND json_extract(integrations_json, '$.instagram.revision') IS ?
  `, [payload, now, input.organization_id, expected.revision])
  if (result.meta?.changes !== 1) {
    throw new Error('The Instagram connection changed. Reload before saving.')
  }
}

/**
 * The connected account. One whose last sync failed is still connected —
 * `status` says so — and publishing still tries it, so the failure a tenant
 * sees is the provider's own answer rather than "not connected".
 */
export async function readInstagramConnection(
  env: CloudflareEnv,
  organizationId: string,
): Promise<InstagramConnection | null> {
  const row = await queryFirst<Omit<InstagramConnection, 'sync'> & { sync: string | null }>(env.DB, `
    SELECT id AS organization_id,
           json_extract(integrations_json, '$.instagram.revision') AS revision,
           json_extract(integrations_json, '$.instagram.account_id') AS account_id,
           json_extract(integrations_json, '$.instagram.instagram_user_id') AS instagram_user_id,
           json_extract(integrations_json, '$.instagram.username') AS username,
           json_extract(integrations_json, '$.instagram.status') AS status,
           json_extract(integrations_json, '$.instagram.created_at') AS created_at,
           json_extract(integrations_json, '$.instagram.updated_at') AS updated_at,
           json_extract(integrations_json, '$.instagram.sync') AS sync
      FROM organization
     WHERE id = ?
       AND json_extract(integrations_json, '$.instagram.status') IN ('active', 'error')
     LIMIT 1
  `, [organizationId])
  return row ? { ...row, sync: row.sync ? JSON.parse(row.sync) as SocialSyncProgress : null } : null
}

export interface InstagramTarget {
  userId: string
  accessToken: string
}

type GraphInit = RequestInit & { deadline?: MetaDeadline }
const withToken = (target: InstagramTarget, init: GraphInit = {}): GraphInit => ({
  ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${target.accessToken}` },
})

// ── Publication primitives: containers, their status, media_publish ───────

export type InstagramContainerInput =
  | { kind: 'image'; url: string; caption?: string; carouselItem: boolean; altText?: string | null }
  | { kind: 'video'; url: string; caption?: string; carouselItem: boolean; coverUrl?: string | null }
  | { kind: 'carousel'; children: readonly string[]; caption?: string }

/** A media container. Instagram fetches the URL itself; nothing is public until it is published. */
export async function createMediaContainer(target: InstagramTarget, input: InstagramContainerInput, deadline: MetaDeadline): Promise<string> {
  const fields: Record<string, string | boolean | undefined> = input.kind === 'image'
    ? { image_url: input.url, is_carousel_item: input.carouselItem || undefined, alt_text: input.altText || undefined }
    : input.kind === 'video'
      // A standalone video is a Reel; a carousel child is a VIDEO item.
      ? { media_type: input.carouselItem ? 'VIDEO' : 'REELS', video_url: input.url, is_carousel_item: input.carouselItem || undefined, cover_url: input.carouselItem ? undefined : input.coverUrl || undefined }
      : { media_type: 'CAROUSEL', children: input.children.join(',') }
  if (!('carouselItem' in input && input.carouselItem) && input.caption) fields.caption = input.caption
  const result = await metaGraphRequest<{ id?: string }>(`${INSTAGRAM_GRAPH}/${target.userId}/media`, withToken(target, { ...formBody(fields), deadline }))
  if (!result.id) throw new Error('Instagram created no media container')
  return result.id
}

export type InstagramContainerStatus = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

export async function readContainerStatus(target: InstagramTarget, containerId: string, deadline: MetaDeadline): Promise<{ status: InstagramContainerStatus; detail: string | null }> {
  const result = await metaGraphRequest<{ status_code?: string; status?: string }>(
    `${INSTAGRAM_GRAPH}/${containerId}?fields=status_code,status`, withToken(target, { deadline }))
  const status = result.status_code
  if (status !== 'EXPIRED' && status !== 'ERROR' && status !== 'FINISHED' && status !== 'IN_PROGRESS' && status !== 'PUBLISHED') {
    throw new Error(`Instagram reported container ${containerId} in an unknown state: ${String(status)}`)
  }
  return { status, detail: result.status ?? null }
}

/** Publishes the saved container. The answer is the published media id. */
export async function publishContainer(target: InstagramTarget, containerId: string, deadline: MetaDeadline): Promise<string> {
  const result = await metaGraphRequest<{ id?: string }>(`${INSTAGRAM_GRAPH}/${target.userId}/media_publish`, withToken(target, { ...formBody({ creation_id: containerId }), deadline }))
  if (!result.id) throw new Error('Instagram did not return the published media id')
  return result.id
}

export interface InstagramMediaRecord {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp: string
  username?: string
  children?: { data?: Array<{ id: string; media_type: 'IMAGE' | 'VIDEO'; media_url?: string; thumbnail_url?: string }> }
}

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username,children{id,media_type,media_url,thumbnail_url}'

export async function readMedia(target: InstagramTarget, mediaId: string, deadline: MetaDeadline): Promise<InstagramMediaRecord> {
  return await metaGraphRequest<InstagramMediaRecord>(`${INSTAGRAM_GRAPH}/${mediaId}?fields=${MEDIA_FIELDS}`, withToken(target, { deadline }))
}

/** One page of the account's own media, newest first, with every carousel child, and the cursor for the next. */
export async function listMedia(target: InstagramTarget, input: { after: string | null; limit: number }, deadline: MetaDeadline): Promise<{ items: InstagramMediaRecord[]; after: string | null }> {
  const params = new URLSearchParams({ fields: MEDIA_FIELDS, limit: String(input.limit), ...(input.after ? { after: input.after } : {}) })
  const page = await metaGraphRequest<{ data?: InstagramMediaRecord[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `${INSTAGRAM_GRAPH}/${target.userId}/media?${params}`, withToken(target, { deadline }))
  return { items: page.data ?? [], after: page.paging?.next ? page.paging.cursors?.after ?? null : null }
}
