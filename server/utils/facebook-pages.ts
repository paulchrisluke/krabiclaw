import type { D1Database } from '@cloudflare/workers-types'
import { encryptSecret, decryptSecret, encryptionEnv } from './encryption'
import { createMediaAsset } from './media-asset-manager'
import { uploadToR2, buildR2Key } from './cloudflare-r2'

const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface FacebookEnv {
  DB: D1Database
  FACEBOOK_APP_ID?: string
  FACEBOOK_APP_SECRET?: string
  FACEBOOK_REDIRECT_URI?: string
  FACEBOOK_CONFIG_ID?: string
  CONNECTOR_TOKEN_ENCRYPTION_KEY?: string
}

export interface FacebookPagesConnection {
  id: string
  organization_id: string
  site_id: string
  connected_by_user_id: string
  facebook_user_id: string
  facebook_page_id?: string
  facebook_page_name?: string
  encrypted_user_token: string
  encrypted_page_token?: string
  user_token_expires_at?: string
  scopes?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
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

export interface InstagramMedia {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url?: string
  thumbnail_url?: string
  permalink: string
  timestamp: string
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
      throw new Error(`Facebook API request timed out after ${GRAPH_TIMEOUT_MS}ms`)
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
  opts: { message: string; link?: string; published?: boolean }
): Promise<{ id: string }> => {
  const body: Record<string, string | boolean> = {
    message: opts.message,
    published: opts.published ?? true,
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
  connection: Omit<FacebookPagesConnection, 'id' | 'created_at' | 'updated_at'>
): Promise<string> => {
  if (!env.DB) throw new Error('Database not available')

  const connectionId = `fb-connection-${connection.organization_id}-${connection.site_id}`
  const now = new Date().toISOString()
  const tokenEnv = encryptionEnv(env)

  const encryptedUserToken = await encryptSecret(connection.encrypted_user_token, tokenEnv)
  const encryptedPageToken = connection.encrypted_page_token
    ? await encryptSecret(connection.encrypted_page_token, tokenEnv)
    : null

  await env.DB.prepare(`
    INSERT INTO facebook_pages_connections
    (id, organization_id, site_id, connected_by_user_id,
     facebook_user_id, facebook_page_id, facebook_page_name,
     encrypted_user_token, encrypted_page_token,
     user_token_expires_at, scopes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, site_id) DO UPDATE SET
      connected_by_user_id = excluded.connected_by_user_id,
      facebook_user_id = excluded.facebook_user_id,
      facebook_page_id = excluded.facebook_page_id,
      facebook_page_name = excluded.facebook_page_name,
      encrypted_user_token = excluded.encrypted_user_token,
      encrypted_page_token = excluded.encrypted_page_token,
      user_token_expires_at = excluded.user_token_expires_at,
      scopes = excluded.scopes,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    connectionId,
    connection.organization_id,
    connection.site_id,
    connection.connected_by_user_id,
    connection.facebook_user_id,
    connection.facebook_page_id ?? null,
    connection.facebook_page_name ?? null,
    encryptedUserToken,
    encryptedPageToken,
    connection.user_token_expires_at ?? null,
    connection.scopes ?? null,
    connection.status,
    now,
    now
  ).run()

  return connectionId
}

export const getFacebookPagesConnection = async (
  env: FacebookEnv,
  organizationId: string,
  siteId: string
): Promise<FacebookPagesConnection | null> => {
  if (!env.DB) return null

  const connection = await env.DB.prepare(`
    SELECT * FROM facebook_pages_connections
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
    LIMIT 1
  `).bind(organizationId, siteId).first() as FacebookPagesConnection | null

  if (!connection) return null

  const tokenEnv = encryptionEnv(env)

  connection.encrypted_user_token = await decryptSecret(connection.encrypted_user_token, tokenEnv)
  if (connection.encrypted_page_token) {
    connection.encrypted_page_token = await decryptSecret(connection.encrypted_page_token, tokenEnv)
  }

  return connection
}

// Returns the Instagram Business Account ID linked to a Facebook Page, or null if none.
export const getLinkedInstagramAccount = async (
  pageToken: string,
  pageId: string
): Promise<string | null> => {
  const params = new URLSearchParams({
    access_token: pageToken,
    fields: 'instagram_business_account',
  })
  const data = await graphFetch<{ instagram_business_account?: { id: string } }>(
    `${GRAPH_BASE}/${pageId}?${params.toString()}`
  )
  return data.instagram_business_account?.id ?? null
}

// Fetch recent media from an Instagram Business Account
export const getInstagramMedia = async (
  pageToken: string,
  igUserId: string,
  limit = 20
): Promise<InstagramMedia[]> => {
  const params = new URLSearchParams({
    access_token: pageToken,
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
    limit: String(limit),
  })
  const data = await graphFetch<{ data: InstagramMedia[] }>(
    `${GRAPH_BASE}/${igUserId}/media?${params.toString()}`
  )
  return data.data ?? []
}

// Publish a photo post to an Instagram Business Account (two-step container → publish).
// imageUrl must be a publicly accessible HTTPS URL.
// If imageUrl is omitted the post is skipped — Instagram requires an image.
export const publishToInstagram = async (
  pageToken: string,
  igUserId: string,
  opts: { caption: string; imageUrl: string }
): Promise<{ id: string }> => {
  // Step 1: create media container
  const containerParams = new URLSearchParams({
    access_token: pageToken,
    image_url: opts.imageUrl,
    caption: opts.caption,
  })
  const container = await graphFetch<{ id: string }>(`${GRAPH_BASE}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: containerParams.toString(),
  })

  // Step 2: publish the container
  const publishParams = new URLSearchParams({
    access_token: pageToken,
    creation_id: container.id,
  })
  return graphFetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publishParams.toString(),
  })
}

export const syncPageInfoToLocation = async (
  env: FacebookEnv,
  page: FacebookPageInfo,
  connectionId: string,
  organizationId: string,
  siteId: string,
  locationId: string
): Promise<void> => {
  if (!env.DB) throw new Error('Database not available')

  const now = new Date().toISOString()
  const updates: string[] = ['facebook_page_id = ?', 'facebook_connection_id = ?', 'last_synced_at = ?', 'updated_at = ?']
  const values: (string | number | null)[] = [page.id, connectionId, now, now]

  if (page.phone) { updates.push('phone = ?'); values.push(page.phone) }
  if (page.website) { updates.push('website_url = ?'); values.push(page.website) }
  if (page.location?.city) { updates.push('city = ?'); values.push(page.location.city) }
  if (page.location?.latitude != null) { updates.push('latitude = ?'); values.push(page.location.latitude) }
  if (page.location?.longitude != null) { updates.push('longitude = ?'); values.push(page.location.longitude) }
  if (page.hours) { updates.push('opening_hours = ?'); values.push(JSON.stringify(page.hours)) }
  if (page.about || page.description) {
    updates.push('short_description = ?')
    values.push(page.about ?? page.description ?? '')
  }

  values.push(organizationId, siteId, locationId)
  await env.DB.prepare(`
    UPDATE business_locations
    SET ${updates.join(', ')}
    WHERE organization_id = ? AND site_id = ? AND id = ?
  `).bind(...values).run()
}

// Sync Instagram media to posts table
export const syncInstagramPosts = async (
  env: FacebookEnv,
  organizationId: string,
  siteId: string,
  pageToken: string,
  igUserId: string,
  limit = 20
): Promise<{ success: number; errors: number; skipped: number }> => {
  if (!env.DB) throw new Error('Database not available')

  const media = await getInstagramMedia(pageToken, igUserId, limit)
  let success = 0
  let errors = 0
  let skipped = 0

  for (const item of media) {
    try {
      // Check if post already exists
      const existing = await env.DB.prepare(
        `SELECT id FROM posts WHERE google_post_id = ? AND site_id = ? LIMIT 1`
      ).bind(`ig-${item.id}`, siteId).first()

      if (existing) {
        skipped++
        continue
      }

      // Download image from Instagram
      const imageUrl = item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url
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
      const assetId = `ig-asset-${item.id}`
      const r2Key = buildR2Key(siteId, assetId, `instagram-${item.id}.jpg`)
      const publicUrl = await uploadToR2(env, r2Key, imageBuffer, 'image/jpeg')

      // Extract title from caption (first line or default)
      const captionLines = item.caption?.split('\n').filter(Boolean) ?? []
      const title = captionLines[0] || 'Instagram Update'
      const body = item.caption || ''

      // Create post record
      const postId = `ig-post-${item.id}`
      const now = new Date().toISOString()

      // Use D1 batch to make asset creation and post insert atomic
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO media_assets (
            id, organization_id, site_id, location_id, kind, provider, source,
            r2_key, public_url, mime_type, file_name, file_size, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          assetId,
          organizationId,
          siteId,
          null,
          'image',
          'cloudflare_r2',
          'external',
          r2Key,
          publicUrl,
          'image/jpeg',
          `instagram-${item.id}.jpg`,
          imageBuffer.byteLength,
          'active',
          now,
          now
        ),
        env.DB.prepare(`
          INSERT INTO posts (
            id, organization_id, site_id, location_id, google_post_id, post_type,
            title, body, image_asset_id, cta_url, status, published_at,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          postId,
          organizationId,
          siteId,
          null,
          `ig-${item.id}`,
          'standard',
          title,
          body,
          assetId,
          item.permalink,
          'published',
          item.timestamp,
          'instagram-sync',
          now,
          now
        )
      ])

      success++
    } catch (err) {
      console.error('Instagram sync failed for item:', item.id, err)
      errors++
    }
  }

  return { success, errors, skipped }
}

// Sync Facebook posts to posts table
export const syncFacebookPosts = async (
  env: FacebookEnv,
  organizationId: string,
  siteId: string,
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
      // Check if post already exists
      const existing = await env.DB.prepare(
        `SELECT id FROM posts WHERE google_post_id = ? AND site_id = ? LIMIT 1`
      ).bind(`fb-${item.id}`, siteId).first()

      if (existing) {
        skipped++
        continue
      }

      // Download image from Facebook
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
      const r2Key = buildR2Key(siteId, assetId, `facebook-${item.id}.jpg`)
      const publicUrl = await uploadToR2(env, r2Key, imageBuffer, 'image/jpeg')

      // Extract title from message/story (first line or default)
      const content = item.message || item.story || ''
      const contentLines = content.split('\n').filter(Boolean)
      const title = contentLines[0] || 'Facebook Update'
      const body = content

      // Create post record
      const postId = `fb-post-${item.id}`
      const now = new Date().toISOString()

      // Use D1 batch to make asset creation and post insert atomic
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO media_assets (
            id, organization_id, site_id, location_id, kind, provider, source,
            r2_key, public_url, mime_type, file_name, file_size, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          assetId,
          organizationId,
          siteId,
          null,
          'image',
          'cloudflare_r2',
          'external',
          r2Key,
          publicUrl,
          'image/jpeg',
          `facebook-${item.id}.jpg`,
          imageBuffer.byteLength,
          'active',
          now,
          now
        ),
        env.DB.prepare(`
          INSERT INTO posts (
            id, organization_id, site_id, location_id, google_post_id, post_type,
            title, body, image_asset_id, cta_url, status, published_at,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          postId,
          organizationId,
          siteId,
          null,
          `fb-${item.id}`,
          'standard',
          title,
          body,
          assetId,
          item.permalink_url,
          'published',
          item.created_time,
          'facebook-sync',
          now,
          now
        )
      ])

      success++
    } catch (err) {
      console.error('Facebook sync failed for item:', item.id, err)
      errors++
    }
  }

  return { success, errors, skipped }
}
