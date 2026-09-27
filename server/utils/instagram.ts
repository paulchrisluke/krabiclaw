import type { InstagramIntegration } from '~/shared/organization-settings'
import { setTokenUtil } from 'better-auth/oauth2'
import { parsePostInput } from '~/shared/posts'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { createAuth, linkedAccountAccessToken, type CloudflareEnv } from './auth'
import { buildR2Key, uploadToR2 } from './cloudflare-r2'
import { prepareContentDocumentWithBlocks } from './content/documents'
import { buildMediaAssetInsertQuery, buildMediaPlacementInsertQuery } from './media-asset-manager'

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

async function instagramAccessToken(env: CloudflareEnv, accountId: string): Promise<string> {
  const token = await linkedAccountAccessToken(env, accountId)
  if (!token.accessTokenExpiresAt) throw new Error('The linked Instagram account has no token expiry. Connect Instagram again.')
  if (token.accessTokenExpiresAt.getTime() - Date.now() > TOKEN_RENEWAL_WINDOW_MS) return token.accessToken

  // POST, not the documented GET: Instagram refuses GET on this endpoint with
  // "Unsupported request - method type: get", as on the exchange endpoint.
  const response = await fetch('https://graph.instagram.com/refresh_access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token.accessToken }),
  })
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
  return await queryFirst<InstagramConnection>(env.DB, `
    SELECT id AS organization_id,
           json_extract(integrations_json, '$.instagram.revision') AS revision,
           json_extract(integrations_json, '$.instagram.account_id') AS account_id,
           json_extract(integrations_json, '$.instagram.instagram_user_id') AS instagram_user_id,
           json_extract(integrations_json, '$.instagram.username') AS username,
           json_extract(integrations_json, '$.instagram.status') AS status,
           json_extract(integrations_json, '$.instagram.created_at') AS created_at,
           json_extract(integrations_json, '$.instagram.updated_at') AS updated_at
      FROM organization
     WHERE id = ?
       AND json_extract(integrations_json, '$.instagram.status') IN ('active', 'error')
     LIMIT 1
  `, [organizationId]) ?? null
}

/** What the last sync found, where the Instagram leaf reads it. */
async function recordSyncStatus(
  env: CloudflareEnv,
  connection: InstagramConnection,
  status: 'active' | 'error',
): Promise<void> {
  await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json,
      '$.instagram.status', ?, '$.instagram.updated_at', ?)
    WHERE id = ? AND json_extract(integrations_json, '$.instagram.revision') IS ?
  `, [status, new Date().toISOString(), connection.organization_id, connection.revision])
}

interface InstagramMedia {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url?: string
  thumbnail_url?: string
  permalink: string
  timestamp: string
}

async function instagramGraph<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${INSTAGRAM_GRAPH}${path}`, { ...init, signal: AbortSignal.timeout(10_000) })
  const text = await response.text()
  if (!response.ok) throw new Error(`Instagram API error: ${text.slice(0, 300)}`)
  return JSON.parse(text) as T
}

/**
 * Publishes a photo post: a media container, then the publish of it. Instagram
 * requires an image, and fetches it itself, so `imageUrl` must be public HTTPS.
 */
export async function publishToInstagram(
  env: CloudflareEnv,
  connection: InstagramConnection,
  opts: { caption: string; imageUrl: string },
): Promise<{ id: string }> {
  const accessToken = await instagramAccessToken(env, connection.account_id)
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, access_token: accessToken }).toString(),
  })
  const container = await instagramGraph<{ id?: string }>(`/${connection.instagram_user_id}/media`,
    form({ image_url: opts.imageUrl, caption: opts.caption }))
  if (!container.id) throw new Error('Instagram did not create a media container')
  const published = await instagramGraph<{ id?: string }>(`/${connection.instagram_user_id}/media_publish`,
    form({ creation_id: container.id }))
  if (!published.id) throw new Error('Instagram did not publish the media container')
  return { id: published.id }
}

/**
 * Imports the account's recent posts as the tenant's own social posts. The
 * connection's status afterwards is what this sync found, so a failure is on
 * the Instagram leaf rather than only in a log.
 */
export async function syncInstagramPosts(
  env: CloudflareEnv,
  connection: InstagramConnection,
  limit = 20,
): Promise<{ success: number; errors: number; skipped: number }> {
  let media: InstagramMedia[]
  try {
    const params = new URLSearchParams({
      access_token: await instagramAccessToken(env, connection.account_id),
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
      limit: String(limit),
    })
    media = (await instagramGraph<{ data?: InstagramMedia[] }>(`/${connection.instagram_user_id}/media?${params.toString()}`)).data ?? []
  } catch (error) {
    await recordSyncStatus(env, connection, 'error')
    throw error
  }

  const organizationId = connection.organization_id
  let success = 0
  let errors = 0
  let skipped = 0
  for (const item of media) {
    try {
      const existing = await queryFirst(env.DB,
        `SELECT id FROM content_documents WHERE kind = 'social_post' AND row_role = 'root'
          AND (metadata_json ->> '$.channels.instagram.provider_post_id') = ? AND organization_id = ? LIMIT 1`,
        [item.id, organizationId])
      if (existing) {
        skipped++
        continue
      }

      const title = item.caption?.split('\n').filter(Boolean)[0] ?? null
      const { body } = parsePostInput({ body: item.caption, post_type: 'standard' })
      const imageUrl = item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url
      if (!imageUrl) {
        skipped++
        continue
      }
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) throw new Error(`Instagram image ${item.id} answered ${imageResponse.status}`)

      const imageBuffer = await imageResponse.arrayBuffer()
      const assetId = `ig-asset-${item.id}`
      const r2Key = buildR2Key(organizationId, assetId, `instagram-${item.id}.jpg`)
      const publicUrl = await uploadToR2(env, r2Key, imageBuffer, 'image/jpeg')
      const postId = `ig-post-${item.id}`
      const now = new Date().toISOString()

      await executeBatch(env.DB, [
        buildMediaAssetInsertQuery({
          id: assetId,
          organization_id: organizationId,
          kind: 'image',
          provider: 'cloudflare_r2',
          source: 'external',
          r2_key: r2Key,
          public_url: publicUrl,
          mime_type: 'image/jpeg',
          file_name: `instagram-${item.id}.jpg`,
          file_size: imageBuffer.byteLength,
          status: 'active',
        }, now),
        ...prepareContentDocumentWithBlocks({ id: postId, organizationId, kind: 'social_post',
          rowRole: 'root', locale: 'en', title, summary: body, status: 'published', visibility: 'listed', source: 'manual',
          publishedAt: item.timestamp, createdBy: 'instagram-sync',
          metadata: { post_type: 'standard', event: null, offer: null, call_to_action: null, alert_type: null,
            channels: { instagram: { status: 'published', provider_post_id: item.id, error_message: null,
              published_at: item.timestamp, created_at: now } } },
        }, []).queries,
        buildMediaPlacementInsertQuery({ organizationId, ownerType: 'content_document', ownerId: postId, slot: 'cover', assetId, sortOrder: 0, createdAt: now, updatedAt: now }),
      ])
      success++
    } catch (error) {
      errors++
      console.error('instagram_sync_item_failed', { organizationId, item: item.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  await recordSyncStatus(env, connection, errors > 0 ? 'error' : 'active')
  return { success, errors, skipped }
}
