import type { IntegrationVersion, FacebookIntegration } from '~/shared/site-settings'
import type { D1Database } from '@cloudflare/workers-types'
import { prepareContentDocumentWithBlocks } from './content/documents'
import { parsePostInput } from '~/shared/posts'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { encryptSecret, decryptSecret, encryptionEnv } from './encryption'
import { uploadToR2, buildR2Key } from './cloudflare-r2'
import { buildMediaAssetInsertQuery, buildMediaPlacementInsertQuery } from './media-asset-manager'

const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface FacebookEnv {
  DB: D1Database
  SITE_CACHE?: KVNamespace
  FACEBOOK_APP_ID?: string
  FACEBOOK_APP_SECRET?: string
  FACEBOOK_REDIRECT_URI?: string
  FACEBOOK_CONFIG_ID?: string
  CONNECTOR_TOKEN_ENCRYPTION_KEY?: string
}

export interface FacebookPagesConnection extends Omit<FacebookIntegration, 'revision'>, IntegrationVersion {
  organization_id: string
}

export interface FacebookPage {
  id: string
  name: string
  access_token: string
  category?: string
  fan_count?: number
  picture?: { data: { url: string } }
}

export interface FacebookPageInfo {
  id: string
  name: string
  about?: string
  description?: string
  emails?: string[]
  phone?: string
  website?: string
  location?: {
    street?: string
    city?: string
    country?: string
    zip?: string
    latitude?: number
    longitude?: number
  }
  hours?: Record<string, string>
  fan_count?: number
  cover?: { source: string }
  picture?: { data: { url: string } }
}

export interface FacebookPost {
  id: string
  message?: string
  story?: string
  created_time: string
  full_picture?: string
  permalink_url?: string
}

const GRAPH_TIMEOUT_MS = 10_000

async function graphFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Facebook API request timed out after ${GRAPH_TIMEOUT_MS}ms`, { cause: err })
    }
    throw err
  }
  clearTimeout(timer)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Facebook API error: ${text.slice(0, 300)}`)
  }
  const data = await response.json() as T & { error?: { message: string } }
  if ((data as { error?: { message: string } }).error) {
    throw new Error((data as { error: { message: string } }).error.message)
  }
  return data
}

export const getFacebookAuthUrl = (env: FacebookEnv, state: string): string => {
  const appId = env.FACEBOOK_APP_ID
  const redirectUri = env.FACEBOOK_REDIRECT_URI

  if (!appId || !redirectUri) {
    throw new Error('Missing FACEBOOK_APP_ID or FACEBOOK_REDIRECT_URI')
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  })

  if (env.FACEBOOK_CONFIG_ID) {
    params.set('config_id', env.FACEBOOK_CONFIG_ID)
  } else {
    params.set('scope', [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_metadata',
    ].join(','))
  }

  return `https://www.facebook.com/dialog/oauth?${params.toString()}`
}

export const exchangeFacebookCode = async (
  env: FacebookEnv,
  code: string
): Promise<string> => {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET || !env.FACEBOOK_REDIRECT_URI) {
    throw new Error('Missing Facebook OAuth configuration')
  }

  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    redirect_uri: env.FACEBOOK_REDIRECT_URI,
    code,
  })

  const data = await graphFetch<{ access_token: string }>(
    `${GRAPH_BASE}/oauth/access_token?${params.toString()}`
  )
  return data.access_token
}

export const getLongLivedUserToken = async (
  env: FacebookEnv,
  shortLivedToken: string
): Promise<{ token: string; expiresIn: number }> => {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    throw new Error('Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET')
  }

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  })

  const data = await graphFetch<{ access_token: string; expires_in?: number }>(
    `${GRAPH_BASE}/oauth/access_token?${params.toString()}`
  )
  return { token: data.access_token, expiresIn: data.expires_in ?? 5183944 }
}

export const getFacebookUserInfo = async (
  userToken: string
): Promise<{ id: string; name: string; email?: string }> => {
  const params = new URLSearchParams({ access_token: userToken, fields: 'id,name,email' })
  return graphFetch(`${GRAPH_BASE}/me?${params.toString()}`)
}

export const getFacebookPages = async (userToken: string): Promise<FacebookPage[]> => {
  const params = new URLSearchParams({
    access_token: userToken,
    fields: 'id,name,access_token,category,fan_count,picture',
  })
  const data = await graphFetch<{ data: FacebookPage[] }>(`${GRAPH_BASE}/me/accounts?${params.toString()}`)
  return data.data ?? []
}

export const getPageInfo = async (pageToken: string, pageId: string): Promise<FacebookPageInfo> => {
  const fields = 'id,name,about,description,emails,phone,website,location,hours,fan_count,cover,picture'
  const params = new URLSearchParams({ access_token: pageToken, fields })
  return graphFetch(`${GRAPH_BASE}/${pageId}?${params.toString()}`)
}

export const getPagePosts = async (
  pageToken: string,
  pageId: string,
  limit = 20
): Promise<FacebookPost[]> => {
  const params = new URLSearchParams({
    access_token: pageToken,
    fields: 'id,message,story,created_time,full_picture,permalink_url',
    limit: String(limit),
  })
  const data = await graphFetch<{ data: FacebookPost[] }>(
    `${GRAPH_BASE}/${pageId}/posts?${params.toString()}`
  )
  return data.data ?? []
}

export const publishToPage = async (
  pageToken: string,
  pageId: string,
  opts: { message: string; link?: string }
): Promise<{ id: string }> => {
  const body: Record<string, string | boolean> = {
    message: opts.message,
    published: true,
  }
  if (opts.link) body.link = opts.link

  return graphFetch(`${GRAPH_BASE}/${pageId}/feed`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export const storeFacebookPagesConnection = async (
  env: FacebookEnv,
  connection: Omit<FacebookPagesConnection, 'id' | 'created_at' | 'updated_at' | keyof IntegrationVersion>,
  expected: IntegrationVersion
): Promise<string> => {
  if (!env.DB) throw new Error('Database not available')

  const connectionId = `fb-connection-${connection.organization_id}-${connection.organization_id}`
  const now = new Date().toISOString()
  const tokenEnv = encryptionEnv(env)

  const encryptedUserToken = await encryptSecret(connection.encrypted_user_token, tokenEnv)
  const encryptedPageToken = connection.encrypted_page_token
    ? await encryptSecret(connection.encrypted_page_token, tokenEnv)
    : null

  const { organization_id: organizationId, ...providerState } = connection
  const payload = JSON.stringify({
    ...providerState, id: connectionId, revision: crypto.randomUUID(),
    encrypted_user_token: encryptedUserToken,
    encrypted_page_token: encryptedPageToken, updated_at: now,
  })
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.facebook',
      json_set(json(?),
        '$.created_at', COALESCE(json_extract(integrations_json, '$.facebook.created_at'), ?)))
    WHERE id = ?
      AND json_extract(integrations_json, '$.facebook.revision') IS ?
  `, [payload, now, organizationId, expected.revision])
  if (result.meta?.changes !== 1) throw new Error('The facebook connection changed during authorization')

  return connectionId
}

export const getFacebookPagesConnection = async (
  env: FacebookEnv,
  organizationId: string,
): Promise<FacebookPagesConnection | null> => {
  const connection = await queryFirst<FacebookPagesConnection>(env.DB, `
    SELECT id AS organization_id,
           json_extract(integrations_json, '$.facebook.id') AS id,
           json_extract(integrations_json, '$.facebook.revision') AS revision,
           json_extract(integrations_json, '$.facebook.connected_by_user_id') AS connected_by_user_id,
           json_extract(integrations_json, '$.facebook.facebook_user_id') AS facebook_user_id,
           json_extract(integrations_json, '$.facebook.page_id') AS page_id,
           json_extract(integrations_json, '$.facebook.page_name') AS page_name,
           json_extract(integrations_json, '$.facebook.encrypted_user_token') AS encrypted_user_token,
           json_extract(integrations_json, '$.facebook.encrypted_page_token') AS encrypted_page_token,
           json_extract(integrations_json, '$.facebook.user_token_expires_at') AS user_token_expires_at,
           json_extract(integrations_json, '$.facebook.scopes') AS scopes,
           json_extract(integrations_json, '$.facebook.status') AS status,
           json_extract(integrations_json, '$.facebook.created_at') AS created_at,
           json_extract(integrations_json, '$.facebook.updated_at') AS updated_at
      FROM organization WHERE id = ?
       AND json_extract(integrations_json, '$.facebook.status') IN ('active', 'error')
     LIMIT 1
  `, [organizationId])

  if (!connection) return null

  const tokenEnv = encryptionEnv(env)

  connection.encrypted_user_token = await decryptSecret(connection.encrypted_user_token, tokenEnv)
  if (connection.encrypted_page_token) {
    connection.encrypted_page_token = await decryptSecret(connection.encrypted_page_token, tokenEnv)
  }

  return connection
}

export const syncFacebookPosts = async (
  env: FacebookEnv,
  organizationId: string,
  pageToken: string,
  pageId: string,
  limit = 20
): Promise<{ success: number; errors: number; skipped: number }> => {
  if (!env.DB) throw new Error('Database not available')

  const posts = await getPagePosts(pageToken, pageId, limit)
  let success = 0
  let errors = 0
  let skipped = 0

  for (const item of posts) {
    try {
      const existing = await queryFirst(env.DB,
        `SELECT id FROM content_documents WHERE kind = 'social_post' AND row_role = 'root'
          AND (metadata_json ->> '$.channels.facebook.provider_post_id') = ? AND organization_id = ? LIMIT 1`,
        [item.id, organizationId]
      )

      if (existing) {
        skipped++
        continue
      }

      const content = item.message || item.story || ''
      const contentLines = content.split('\n').filter(Boolean)
      const title = contentLines[0] ?? null
      const { body } = parsePostInput({ body: content, post_type: 'standard' })

      const imageUrl = item.full_picture
      if (!imageUrl) {
        skipped++
        continue
      }

      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        errors++
        continue
      }

      const imageBuffer = await imageResponse.arrayBuffer()
      const assetId = `fb-asset-${item.id}`
      const r2Key = buildR2Key(organizationId, assetId, `facebook-${item.id}.jpg`)
      const publicUrl = await uploadToR2(env, r2Key, imageBuffer, 'image/jpeg')

      const postId = `fb-post-${item.id}`
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
          file_name: `facebook-${item.id}.jpg`,
          file_size: imageBuffer.byteLength,
          status: 'active',
        }, now),
        ...prepareContentDocumentWithBlocks({ id: postId, organizationId, kind: 'social_post',
          rowRole: 'root', locale: 'en', title, summary: body, status: 'published', visibility: 'listed', source: 'manual',
          publishedAt: item.created_time, createdBy: 'facebook-sync',
          metadata: { post_type: 'standard', event: null, offer: null, call_to_action: null, alert_type: null,
            channels: { facebook: { status: 'published', provider_post_id: item.id, error_message: null,
              published_at: item.created_time, created_at: now } } },
        }, []).queries,
        buildMediaPlacementInsertQuery({ organizationId, ownerType: 'content_document', ownerId: postId, slot: 'cover', assetId, sortOrder: 0, createdAt: now, updatedAt: now }),
      ])

      success++
    } catch (err) {
      console.error('Facebook sync failed for item:', item.id, err)
      errors++
    }
  }

  return { success, errors, skipped }
}

/**
 * Tells Meta to forget this app's authorization for the connected user. Best
 * effort at the call site: a token Meta has already invalidated, or a user who
 * revoked from their own Facebook settings, must not stop the connection being
 * released here.
 */
export const revokeFacebookAuthorization = async (
  facebookUserId: string,
  userToken: string,
): Promise<void> => {
  const params = new URLSearchParams({ access_token: userToken })
  const response = await fetch(`${GRAPH_BASE}/${facebookUserId}/permissions?${params.toString()}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(`Facebook authorization revoke failed: ${(await response.text()).slice(0, 200)}`)
  }
}

/**
 * Meta signs the payload it posts to the deauthorize and data-deletion
 * callbacks rather than authenticating the request any other way, so verifying
 * this signature *is* the authorization check for those endpoints.
 *
 * `payload.user_id` is the Meta user whose authorization ended. Returns null
 * when the signature does not verify, which the callers answer as a refusal —
 * an unsigned caller must never be able to disconnect a tenant's integration.
 */
export const parseMetaSignedRequest = async (
  signedRequest: string,
  appSecret: string,
): Promise<{ user_id?: string; algorithm?: string; issued_at?: number } | null> => {
  const [encodedSignature, encodedPayload] = signedRequest.split('.')
  if (!encodedSignature || !encodedPayload) return null

  const base64UrlDecode = (value: string): ArrayBuffer => {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
    const buffer = new ArrayBuffer(binary.length)
    const bytes = new Uint8Array(buffer)
    for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at)
    return buffer
  }

  let signature: ArrayBuffer
  let payloadBytes: ArrayBuffer
  try {
    signature = base64UrlDecode(encodedSignature)
    payloadBytes = new TextEncoder().encode(encodedPayload).buffer as ArrayBuffer
  } catch {
    return null
  }

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  )
  if (!(await crypto.subtle.verify('HMAC', key, signature, payloadBytes))) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as {
      user_id?: string
      algorithm?: string
      issued_at?: number
    }
    // Meta only ever signs HMAC-SHA256; anything else is a payload this
    // verification did not actually cover.
    return payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256' ? null : payload
  } catch {
    return null
  }
}

/**
 * A Facebook connection always names a Page — the schema requires it — so the
 * Page has to be chosen before anything is stored. When the authorization
 * returns more than one, the tokens wait here between the callback and the
 * tenant's choice: encrypted, in the cache namespace, under an opaque handle,
 * for ten minutes.
 *
 * The handle travels in the redirect URL and the tokens never do, and there is
 * no half-connected row for a tenant to find, because a Page nobody picked is
 * not a connection.
 */
const PENDING_SELECTION_TTL_SECONDS = 600
const pendingSelectionKey = (handle: string) => `facebook-page-selection:${handle}`

export interface PendingPageSelection {
  organizationId: string
  userId: string
  facebookUserId: string
  userToken: string
  revision: string | null
  pages: FacebookPage[]
}

export const storePendingPageSelection = async (
  env: FacebookEnv,
  selection: PendingPageSelection,
): Promise<string> => {
  if (!env.SITE_CACHE) throw new Error('Cache namespace unavailable for Facebook page selection')
  const handle = crypto.randomUUID()
  const sealed = await encryptSecret(JSON.stringify(selection), encryptionEnv(env))
  await env.SITE_CACHE.put(pendingSelectionKey(handle), sealed, {
    expirationTtl: PENDING_SELECTION_TTL_SECONDS,
  })
  return handle
}

export const readPendingPageSelection = async (
  env: FacebookEnv,
  handle: string,
): Promise<PendingPageSelection | null> => {
  if (!env.SITE_CACHE) return null
  const sealed = await env.SITE_CACHE.get(pendingSelectionKey(handle))
  if (!sealed) return null
  try {
    return JSON.parse(await decryptSecret(sealed, encryptionEnv(env))) as PendingPageSelection
  } catch {
    return null
  }
}

export const clearPendingPageSelection = async (env: FacebookEnv, handle: string): Promise<void> => {
  await env.SITE_CACHE?.delete(pendingSelectionKey(handle))
}
