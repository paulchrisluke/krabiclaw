import type { D1Database } from '@cloudflare/workers-types'
import { encryptSecret, decryptSecret } from './encryption'

const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface FacebookEnv {
  REVIEWS_DB: D1Database
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
  if (!env.REVIEWS_DB) throw new Error('Database not available')

  const connectionId = `fb-connection-${connection.organization_id}-${connection.site_id}`
  const now = new Date().toISOString()

  const encryptedUserToken = await encryptSecret(connection.encrypted_user_token, env)
  const encryptedPageToken = connection.encrypted_page_token
    ? await encryptSecret(connection.encrypted_page_token, env)
    : null

  await env.REVIEWS_DB.prepare(`
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
  if (!env.REVIEWS_DB) return null

  const connection = await env.REVIEWS_DB.prepare(`
    SELECT * FROM facebook_pages_connections
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
    LIMIT 1
  `).bind(organizationId, siteId).first() as FacebookPagesConnection | null

  if (!connection) return null

  connection.encrypted_user_token = await decryptSecret(connection.encrypted_user_token, env)
  if (connection.encrypted_page_token) {
    connection.encrypted_page_token = await decryptSecret(connection.encrypted_page_token, env)
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
  if (!env.REVIEWS_DB) throw new Error('Database not available')

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
  await env.REVIEWS_DB.prepare(`
    UPDATE business_locations
    SET ${updates.join(', ')}
    WHERE organization_id = ? AND site_id = ? AND id = ?
  `).bind(...values).run()
}
