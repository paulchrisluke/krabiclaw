import type { FacebookIntegration } from '~/shared/organization-settings'
import { prepareContentDocumentWithBlocks } from './content/documents'
import { parsePostInput } from '~/shared/posts'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { linkedAccountAccessToken, type CloudflareEnv } from './auth'
import { uploadToR2, buildR2Key } from './cloudflare-r2'
import { buildMediaAssetInsertQuery, buildMediaPlacementInsertQuery } from './media-asset-manager'

/**
 * A Facebook Page as an organization's integration.
 *
 * The Facebook identity and its user token are a Better Auth linked account;
 * the organization stores which of those accounts it acts through and which
 * Page it chose. A Page token is never stored: it is read from the Pages the
 * linked account manages each time one is needed, so a Page the account stops
 * managing stops working rather than carrying on with a copied credential.
 */

const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface FacebookPagesConnection extends FacebookIntegration {
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

const getFacebookPages = async (userToken: string): Promise<FacebookPage[]> => {
  const params = new URLSearchParams({
    access_token: userToken,
    fields: 'id,name,access_token,category,fan_count,picture',
  })
  const data = await graphFetch<{ data: FacebookPage[] }>(`${GRAPH_BASE}/me/accounts?${params.toString()}`)
  return data.data ?? []
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
  env: CloudflareEnv,
  connection: { organization_id: string; account_id: string; page_id: string; page_name: string },
  expected: { revision: string | null },
): Promise<void> => {
  const now = new Date().toISOString()
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
  return await queryFirst<FacebookPagesConnection>(env.DB, `
    SELECT id AS organization_id,
           json_extract(integrations_json, '$.facebook.revision') AS revision,
           json_extract(integrations_json, '$.facebook.account_id') AS account_id,
           json_extract(integrations_json, '$.facebook.page_id') AS page_id,
           json_extract(integrations_json, '$.facebook.page_name') AS page_name,
           json_extract(integrations_json, '$.facebook.status') AS status,
           json_extract(integrations_json, '$.facebook.created_at') AS created_at,
           json_extract(integrations_json, '$.facebook.updated_at') AS updated_at
      FROM organization WHERE id = ?
       AND json_extract(integrations_json, '$.facebook.status') IN ('active', 'error')
     LIMIT 1
  `, [organizationId]) ?? null
}

/** The Pages a linked Facebook account manages, each with its Page token. */
export const listLinkedFacebookPages = async (env: CloudflareEnv, accountId: string): Promise<FacebookPage[]> =>
  await getFacebookPages((await linkedAccountAccessToken(env, accountId)).accessToken)

/** The connected Page's token, read through the linked account that manages it. */
export const facebookPageToken = async (env: CloudflareEnv, connection: FacebookPagesConnection): Promise<string> => {
  const page = (await listLinkedFacebookPages(env, connection.account_id)).find(candidate => candidate.id === connection.page_id)
  if (!page) throw new Error(`The linked Facebook account no longer manages the Page ${connection.page_name}. Connect Facebook again.`)
  return page.access_token
}

export const syncFacebookPosts = async (
  env: CloudflareEnv,
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
  appSecrets: readonly string[],
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

  let verified = false
  for (const appSecret of appSecrets) {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    )
    if (await crypto.subtle.verify('HMAC', key, signature, payloadBytes)) { verified = true; break }
  }
  if (!verified) return null

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
