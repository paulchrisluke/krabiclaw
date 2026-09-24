import type { D1Database } from '@cloudflare/workers-types'
import type { InstagramIntegration } from '~/shared/site-settings'
import { parsePostInput } from '~/shared/posts'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { buildR2Key, uploadToR2 } from './cloudflare-r2'
import { prepareContentDocumentWithBlocks } from './content/documents'
import { decryptSecret, encryptSecret, encryptionEnv } from './encryption'
import { buildMediaAssetInsertQuery, buildMediaPlacementInsertQuery } from './media-asset-manager'

/**
 * Instagram as its own connection.
 *
 * It used to be derived: the Facebook Page's linked Instagram Business account,
 * discovered through `getLinkedInstagramAccount`, with no record of its own. A
 * tenant could not connect Instagram without connecting a Facebook Page, could
 * not see that it was connected, and disconnecting Facebook silently took
 * Instagram with it. This is Instagram Login for professional accounts: its own
 * app credentials, its own token, its own record, its own disconnect.
 *
 * Releasing it goes through server/utils/integration-release.ts like every
 * other product, so the dashboard's Disconnect and Meta's deauthorization
 * callback do the same thing.
 */
export interface InstagramEnv {
  DB: D1Database
  INSTAGRAM_APP_ID?: string
  INSTAGRAM_APP_SECRET?: string
  INSTAGRAM_REDIRECT_URI?: string
  CONNECTOR_TOKEN_ENCRYPTION_KEY?: string
}

const INSTAGRAM_API_VERSION = 'v23.0'
const INSTAGRAM_GRAPH = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}`

/** What publishing needs, and what the Meta app is already approved for. */
const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
]

export interface InstagramConnection extends InstagramIntegration {
  organization_id: string
}

export function getInstagramAuthUrl(env: InstagramEnv, state: string): string {
  const clientId = env.INSTAGRAM_APP_ID
  const redirectUri = env.INSTAGRAM_REDIRECT_URI
  if (!clientId || !redirectUri) throw new Error('Missing Instagram OAuth configuration')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`
}

/**
 * Short-lived token plus the Instagram-scoped id of the person who granted it —
 * the id Meta's deauthorize and data-deletion callbacks name. Publishing uses
 * the professional account id from getInstagramAccount instead.
 */
export async function exchangeInstagramCode(
  env: InstagramEnv,
  code: string,
): Promise<{ accessToken: string; instagramUserId: string }> {
  const clientId = env.INSTAGRAM_APP_ID
  const clientSecret = env.INSTAGRAM_APP_SECRET
  const redirectUri = env.INSTAGRAM_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing Instagram OAuth configuration')

  const response = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!response.ok) throw new Error(`Instagram token exchange failed: ${(await response.text()).slice(0, 300)}`)

  // Documented as `{ data: [{ access_token, user_id, permissions }] }`
  // (developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login);
  // the same endpoint under the retired Basic Display API answered unwrapped.
  type Grant = { access_token?: string; user_id?: number | string }
  const body = await response.json() as Grant & { data?: Grant[] }
  const token = body.data?.[0] ?? body
  if (!token.access_token || token.user_id === undefined) throw new Error('Instagram did not return an access token')
  return { accessToken: token.access_token, instagramUserId: String(token.user_id) }
}

/** Short-lived tokens last an hour; publishing needs the 60-day one. */
export async function exchangeForLongLivedInstagramToken(
  env: InstagramEnv,
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const clientSecret = env.INSTAGRAM_APP_SECRET
  if (!clientSecret) throw new Error('Missing Instagram OAuth configuration')

  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: clientSecret,
    access_token: shortLivedToken,
  })
  const response = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`)
  if (!response.ok) throw new Error(`Instagram token exchange failed: ${(await response.text()).slice(0, 300)}`)

  return longLivedToken(response)
}

/**
 * A long-lived token lasts sixty days and is renewed by exchanging it for a new
 * one before it runs out. Nothing else keeps a connection alive, so the read
 * every caller goes through renews it (see readInstagramConnection).
 */
async function refreshLongLivedInstagramToken(accessToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken })
  const response = await fetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`)
  if (!response.ok) throw new Error(`Instagram token refresh failed: ${(await response.text()).slice(0, 300)}`)
  return longLivedToken(response)
}

async function longLivedToken(response: Response): Promise<{ accessToken: string; expiresAt: string }> {
  const token = await response.json() as { access_token?: string; expires_in?: number }
  if (!token.access_token || typeof token.expires_in !== 'number') {
    throw new Error('Instagram did not return a long-lived access token and its lifetime')
  }
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
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
  env: InstagramEnv,
  input: {
    organization_id: string
    connected_by_user_id: string
    instagram_user_id: string
    scoped_user_id: string
    username: string
    access_token: string
    token_expires_at: string
  },
  expected: { revision: string | null },
): Promise<void> {
  if (!env.DB) throw new Error('Database not available')
  const now = new Date().toISOString()
  const payload = JSON.stringify({
    id: `instagram-${input.organization_id}`,
    revision: crypto.randomUUID(),
    connected_by_user_id: input.connected_by_user_id,
    instagram_user_id: input.instagram_user_id,
    scoped_user_id: input.scoped_user_id,
    username: input.username,
    encrypted_access_token: await encryptSecret(input.access_token, encryptionEnv(env)),
    token_expires_at: input.token_expires_at,
    scopes: INSTAGRAM_SCOPES.join(','),
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
    throw new Error('The site or its Instagram connection changed during authorization. Try again.')
  }
}

/** Renewed this long before it expires; a token older than a day can be refreshed. */
const TOKEN_RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The connected account and a usable token. An account whose last sync failed
 * is still connected — `status` says so — and publishing still tries it, so the
 * failure a tenant sees is the provider's own answer rather than "not
 * connected".
 */
export async function readInstagramConnection(
  env: InstagramEnv,
  organizationId: string,
): Promise<InstagramConnection | null> {
  const row = await queryFirst<InstagramConnection>(env.DB, `
    SELECT id AS organization_id,
           json_extract(integrations_json, '$.instagram.id') AS id,
           json_extract(integrations_json, '$.instagram.revision') AS revision,
           json_extract(integrations_json, '$.instagram.connected_by_user_id') AS connected_by_user_id,
           json_extract(integrations_json, '$.instagram.instagram_user_id') AS instagram_user_id,
           json_extract(integrations_json, '$.instagram.username') AS username,
           json_extract(integrations_json, '$.instagram.encrypted_access_token') AS encrypted_access_token,
           json_extract(integrations_json, '$.instagram.token_expires_at') AS token_expires_at,
           json_extract(integrations_json, '$.instagram.scopes') AS scopes,
           json_extract(integrations_json, '$.instagram.status') AS status,
           json_extract(integrations_json, '$.instagram.created_at') AS created_at,
           json_extract(integrations_json, '$.instagram.updated_at') AS updated_at
      FROM organization
     WHERE id = ?
       AND json_extract(integrations_json, '$.instagram.status') IN ('active', 'error')
     LIMIT 1
  `, [organizationId])
  if (!row) return null
  row.encrypted_access_token = await decryptSecret(row.encrypted_access_token, encryptionEnv(env))

  if (!row.token_expires_at) throw new Error('The Instagram connection has no token expiry. Connect Instagram again.')
  if (Date.parse(row.token_expires_at) - Date.now() > TOKEN_RENEWAL_WINDOW_MS) return row

  const renewed = await refreshLongLivedInstagramToken(row.encrypted_access_token)
  const revision = crypto.randomUUID()
  const now = new Date().toISOString()
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json,
      '$.instagram.encrypted_access_token', ?, '$.instagram.token_expires_at', ?,
      '$.instagram.revision', ?, '$.instagram.updated_at', ?)
    WHERE id = ? AND json_extract(integrations_json, '$.instagram.revision') IS ?
  `, [await encryptSecret(renewed.accessToken, encryptionEnv(env)), renewed.expiresAt, revision, now, organizationId, row.revision])
  if (result.meta?.changes !== 1) throw new Error('The Instagram connection changed while its token was being renewed.')
  return { ...row, encrypted_access_token: renewed.accessToken, token_expires_at: renewed.expiresAt, revision, updated_at: now }
}

/** What the last sync found, where the Instagram leaf reads it. */
async function recordSyncStatus(
  env: InstagramEnv,
  connection: InstagramConnection,
  status: 'active' | 'error',
): Promise<void> {
  await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json,
      '$.instagram.status', ?, '$.instagram.updated_at', ?)
    WHERE id = ? AND json_extract(integrations_json, '$.instagram.revision') IS ?
  `, [status, new Date().toISOString(), connection.organization_id, connection.revision])
}

/**
 * Tells Instagram to forget this app's authorization. Best effort: a token
 * Instagram has already invalidated, or an account that revoked from their own
 * settings, must not stop the connection being released here.
 */
export async function revokeInstagramAuthorization(
  instagramUserId: string,
  accessToken: string,
): Promise<void> {
  const params = new URLSearchParams({ access_token: accessToken })
  const response = await fetch(`${INSTAGRAM_GRAPH}/${instagramUserId}/permissions?${params.toString()}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(`Instagram authorization revoke failed: ${(await response.text()).slice(0, 200)}`)
  }
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
  connection: InstagramConnection,
  opts: { caption: string; imageUrl: string },
): Promise<{ id: string }> {
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, access_token: connection.encrypted_access_token }).toString(),
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
  env: InstagramEnv & ApiRecord,
  connection: InstagramConnection,
  limit = 20,
): Promise<{ success: number; errors: number; skipped: number }> {
  let media: InstagramMedia[]
  try {
    const params = new URLSearchParams({
      access_token: connection.encrypted_access_token,
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
