import type { D1Database } from '@cloudflare/workers-types'
import { execute, queryFirst } from '~/server/db'
import { encryptSecret, decryptSecret, encryptionEnv } from './encryption'
import { notifyReviewReceived } from './notifications'
import { fireSiteEventSafe } from './site-events'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

type JsonRecord = Record<string, JsonValue>

export interface GoogleBusinessEnv {
  DB: D1Database
  CONNECTOR_TOKEN_ENCRYPTION_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_BUSINESS_ACCOUNT_ID?: string
  GOOGLE_PUBSUB_TOPIC?: string
  GOOGLE_REFRESH_TOKEN?: string
  GOOGLE_BUSINESS_CLIENT_ID?: string
  GOOGLE_BUSINESS_CLIENT_SECRET?: string
  GOOGLE_BUSINESS_REDIRECT_URI?: string
  // Notification env, used to alert the owner when a new review comes in via sync
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

export interface GoogleBusinessSyncResult {
  syncedAt: string
  business: JsonValue
  reviews: JsonRecord[]
  media: JsonRecord[]
  posts: JsonRecord[]
  errors: Array<{ source: string; message: string }>
}

const googleJson = async <T>(url: string, accessToken: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`)
  }

  return (await response.json()) as T
}

export const locationName = (locationId?: string) => {
  if (!locationId) return ''
  return locationId.startsWith('locations/') ? locationId : `locations/${locationId}`
}

// Get access token for a specific connection
export const getGoogleAccessTokenForSite = async (env: GoogleBusinessEnv, organizationId: string, siteId: string, locationId?: string) => {
  const connection = await getGoogleBusinessConnection(env, organizationId, siteId, locationId)
  if (!connection) {
    throw new Error('No Google Business connection found for this site.')
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing Google OAuth client configuration.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.encrypted_refresh_token, // It's decrypted in getGoogleBusinessConnection
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Could not refresh Google token: ${text.slice(0, 300)}`)
  }

  const token = (await response.json()) as { access_token?: string }
  if (!token.access_token) throw new Error('Google token response did not include access_token.')
  return token.access_token
}

export const getGoogleAccessToken = async (env: GoogleBusinessEnv) => {
  if (env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    })
    if (response.ok) {
      const token = await response.json() as { access_token: string }
      return token.access_token
    }
  }
  throw new Error('Google refresh token not available.')
}

export const getGoogleBusinessData = async (env: GoogleBusinessEnv, locationId?: string) => {
  // This function now needs to be called in a context where we have tokens, 
  // or it will fall back to env-based tokens
  const accessToken = await getGoogleAccessToken(env)
  const locName = locationName(locationId)
  
  let business: JsonValue = null
  let reviews: JsonRecord[] = []
  let media: JsonRecord[] = []
  let posts: JsonRecord[] = []
  const errors: { source: string; message: string }[] = []

  if (!locName) {
    return { business, reviews, media, posts, errors }
  }

  const readMask = [
    'name', 'title', 'profile', 'storefrontAddress', 'phoneNumbers', 'websiteUri',
    'regularHours', 'specialHours', 'categories', 'latlng', 'metadata',
    'priceLevel', 'labels', 'serviceItems', 'openInfo'
  ].join(',')

  try {
    business = await googleJson(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locName}?readMask=${encodeURIComponent(readMask)}`,
      accessToken
    )
  } catch (error) {
    errors.push({ source: 'business', message: error instanceof Error ? error.message : String(error) })
  }

  try {
    const response = await googleJson<{ reviews?: JsonRecord[] }>(
      `https://mybusinessreviews.googleapis.com/v1/${locName}/reviews?pageSize=50`,
      accessToken
    )
    reviews = response.reviews ?? []
  } catch (error) {
    errors.push({ source: 'reviews', message: error instanceof Error ? error.message : String(error) })
  }

  try {
    const response = await googleJson<{ mediaItems?: JsonRecord[] }>(
      `https://mybusinessmedia.googleapis.com/v1/${locName}/media?pageSize=50`,
      accessToken
    )
    media = response.mediaItems ?? []
  } catch (error) {
    errors.push({ source: 'media', message: error instanceof Error ? error.message : String(error) })
  }

  try {
    const response = await googleJson<{ localPosts?: JsonRecord[] }>(
      `https://mybusinessposts.googleapis.com/v1/${locName}/localPosts?pageSize=20`,
      accessToken
    )
    posts = response.localPosts ?? []
  } catch (error) {
    errors.push({ source: 'posts', message: error instanceof Error ? error.message : String(error) })
  }

  return { syncedAt: new Date().toISOString(), business, reviews, media, posts, errors }
}

// Google Business OAuth flow
export interface GoogleBusinessConnection {
  id: string
  organization_id: string
  site_id: string
  location_id?: string
  connected_by_user_id: string
  provider_account_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  scopes: string
  expires_at?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface GoogleAccount {
  name: string
  accountName: string
  type: string
  role: string
  verificationState: string
}

export interface GoogleLocation {
  name: string
  title: string
  address?: {
    streetAddress?: string
    locality?: string
    region?: string
    postalCode?: string
    country?: string
  }
  phoneNumbers?: {
    primaryPhoneNumber?: string
  }
  websiteUri?: string
  latlng?: {
    latitude?: number
    longitude?: number
  }
  categories?: {
    primaryCategoryId?: string
    displayName?: string
  }[]
  rating?: number
  reviewCount?: number
}

// Generate OAuth authorization URL
export const getGoogleBusinessAuthUrl = (env: GoogleBusinessEnv, state: string): string => {
  const clientId = env.GOOGLE_BUSINESS_CLIENT_ID
  const redirectUri = env.GOOGLE_BUSINESS_REDIRECT_URI
  
  if (!clientId || !redirectUri) {
    throw new Error('Missing Google Business OAuth configuration')
  }

  const scopes = [
    'https://www.googleapis.com/auth/business.manage',
    'https://www.googleapis.com/auth/userinfo.email'
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent'
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// Exchange OAuth code for tokens
export const exchangeGoogleBusinessCode = async (
  env: GoogleBusinessEnv,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> => {
  const clientId = env.GOOGLE_BUSINESS_CLIENT_ID
  const clientSecret = env.GOOGLE_BUSINESS_CLIENT_SECRET
  const redirectUri = env.GOOGLE_BUSINESS_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google Business OAuth configuration')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google OAuth token exchange failed: ${text}`)
  }

  const tokenData = await response.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    scope: tokenData.scope
  }
}

// Store encrypted Google Business connection
export const storeGoogleBusinessConnection = async (
  env: GoogleBusinessEnv,
  connection: Omit<GoogleBusinessConnection, 'id' | 'created_at' | 'updated_at'>
): Promise<string> => {
  if (!env.DB) {
    throw new Error('Database not available')
  }

  const locationSuffix = connection.location_id ? `-${connection.location_id}` : ''
  const connectionId = `gb-connection-${connection.organization_id}-${connection.site_id}${locationSuffix}`
  const now = new Date().toISOString()
  const tokenEnv = encryptionEnv(env)

  // Encrypt tokens
  const encryptedAccessToken = await encryptSecret(connection.encrypted_access_token, tokenEnv)
  const encryptedRefreshToken = await encryptSecret(connection.encrypted_refresh_token, tokenEnv)

  await execute(env.DB, `
    INSERT OR REPLACE INTO google_business_connections
    (id, organization_id, site_id, location_id, connected_by_user_id, provider_account_email,
     encrypted_access_token, encrypted_refresh_token, scopes, expires_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    connectionId,
    connection.organization_id,
    connection.site_id,
    connection.location_id ?? null,
    connection.connected_by_user_id,
    connection.provider_account_email,
    encryptedAccessToken,
    encryptedRefreshToken,
    connection.scopes,
    connection.expires_at,
    connection.status,
    now,
    now
  ])

  return connectionId
}

// Get Google Business connection with decrypted tokens
export const getGoogleBusinessConnection = async (
  env: GoogleBusinessEnv,
  organizationId: string,
  siteId: string,
  locationId?: string
): Promise<GoogleBusinessConnection | null> => {
  if (!env.DB) {
    return null
  }

  let connection: GoogleBusinessConnection | null

  if (locationId) {
    connection = (await queryFirst<GoogleBusinessConnection>(env.DB, `
      SELECT * FROM google_business_connections
      WHERE organization_id = ? AND site_id = ? AND location_id = ? AND status = 'active'
      LIMIT 1
    `, [organizationId, siteId, locationId])) ?? null
  } else {
    connection = (await queryFirst<GoogleBusinessConnection>(env.DB, `
      SELECT * FROM google_business_connections
      WHERE organization_id = ? AND site_id = ? AND location_id IS NULL AND status = 'active'
      LIMIT 1
    `, [organizationId, siteId])) ?? null
  }

  if (!connection) {
    return null
  }

  const tokenEnv = encryptionEnv(env)

  // Decrypt tokens
  connection.encrypted_access_token = await decryptSecret(connection.encrypted_access_token, tokenEnv)
  connection.encrypted_refresh_token = await decryptSecret(connection.encrypted_refresh_token, tokenEnv)

  return connection
}

// Get Google Business accounts
export const getGoogleBusinessAccounts = async (
  env: GoogleBusinessEnv,
  accessToken: string
): Promise<GoogleAccount[]> => {
  void env
  const response = await googleJson<{ accounts?: GoogleAccount[] }>(
    'https://mybusinessbusinessinformation.googleapis.com/v1/accounts',
    accessToken
  )

  return response.accounts || []
}

// Get Google Business locations for an account
export const getGoogleBusinessLocations = async (
  env: GoogleBusinessEnv,
  accessToken: string,
  accountId: string
): Promise<GoogleLocation[]> => {
  void env
  const readMask = [
    'name', 'title', 'storefrontAddress', 'phoneNumbers', 'websiteUri',
    'latlng', 'categories', 'rating', 'reviewCount'
  ].join(',')

  const response = await googleJson<{ locations?: GoogleLocation[] }>(
    `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations?readMask=${encodeURIComponent(readMask)}`,
    accessToken
  )

  return response.locations || []
}

// Sync Google locations to business_locations table and upsert their reviews
export const syncGoogleLocations = async (
  env: GoogleBusinessEnv,
  organizationId: string,
  siteId: string,
  locations: GoogleLocation[],
  accessToken?: string
): Promise<{ reviewsUpserted: number }> => {
  if (!env.DB) {
    throw new Error('Database not available')
  }

  const now = new Date().toISOString()
  let reviewsUpserted = 0
  const notificationPromises: Promise<void>[] = []

  for (const location of locations) {
    const googleLocationId = location.name.split('/').pop() || ''
    const slug = generateLocationSlug(location.title)

    let localLocationId: string

    // Check if location already exists
    const existing = await queryFirst<{ id: string }>(env.DB, `
      SELECT id FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND google_location_id = ?
      LIMIT 1
    `, [organizationId, siteId, googleLocationId])

    if (existing) {
      localLocationId = existing.id
      await execute(env.DB, `
        UPDATE business_locations
        SET title = ?, address = ?, phone = ?, website_url = ?,
            latitude = ?, longitude = ?, rating = ?, review_count = ?,
            last_synced_at = ?, updated_at = ?
        WHERE organization_id = ? AND site_id = ? AND google_location_id = ?
      `, [
        location.title,
        JSON.stringify(location.address),
        location.phoneNumbers?.primaryPhoneNumber || null,
        location.websiteUri || null,
        location.latlng?.latitude || null,
        location.latlng?.longitude || null,
        location.rating || null,
        location.reviewCount || null,
        now,
        now,
        organizationId,
        siteId,
        googleLocationId
      ])
      await fireSiteEventSafe({
        db: env.DB,
        organizationId,
        siteId,
        locationId: localLocationId,
        eventType: 'location.updated',
        entityType: 'business_location',
        entityId: localLocationId,
        metadata: {
          source: 'google_business_sync',
          google_location_id: googleLocationId,
          title: location.title,
        },
      })
    } else {
      localLocationId = `location-${organizationId}-${siteId}-${googleLocationId}`
      await execute(env.DB, `
        INSERT INTO business_locations
        (id, organization_id, site_id, google_location_id,
         slug, title, address, phone, website_url, latitude, longitude,
         rating, review_count, is_primary, status, last_synced_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        localLocationId,
        organizationId,
        siteId,
        googleLocationId,
        slug,
        location.title,
        JSON.stringify(location.address),
        location.phoneNumbers?.primaryPhoneNumber || null,
        location.websiteUri || null,
        location.latlng?.latitude || null,
        location.latlng?.longitude || null,
        location.rating || null,
        location.reviewCount || null,
        false,
        'active',
        now,
        now,
        now
      ])
      await fireSiteEventSafe({
        db: env.DB,
        organizationId,
        siteId,
        locationId: localLocationId,
        eventType: 'location.created',
        entityType: 'business_location',
        entityId: localLocationId,
        metadata: {
          source: 'google_business_sync',
          google_location_id: googleLocationId,
          title: location.title,
        },
      })
      await fireSiteEventSafe({
        db: env.DB,
        organizationId,
        siteId,
        locationId: localLocationId,
        eventType: 'location.gmb_connected',
        entityType: 'business_location',
        entityId: localLocationId,
        metadata: {
          google_location_id: googleLocationId,
          title: location.title,
        },
      })
    }

    // Sync reviews from GBP if we have an access token
    if (accessToken) {
      try {
        const reviewResp = await googleJson<{ reviews?: JsonRecord[] }>(
          `https://mybusinessreviews.googleapis.com/v1/${location.name}/reviews?pageSize=50`,
          accessToken
        )
        for (const r of reviewResp.reviews ?? []) {
          const reviewName = String(r.name ?? '')
          if (!reviewName) continue
          const rating = Number(r.rating ?? 0)
          if (!rating) continue

          const reviewer = r.reviewer as JsonRecord | undefined
          const authorName = String((reviewer?.displayName) ?? 'Anonymous')
          const authorPhotoUrl = String((reviewer?.profilePhotoUrl) ?? '') || null
          const comment = r.comment ? String(r.comment) : null
          const createTime = r.createTime ? String(r.createTime) : now

          const reviewId = `gbiz-${reviewName.replace(/\//g, '-')}`
          const result = await execute(env.DB, `
            INSERT OR IGNORE INTO reviews
              (id, organization_id, site_id, location_id, google_review_id,
               author_name, reviewer_photo_url, rating, content,
               status, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'google_business', ?, ?)
          `, [
            reviewId,
            organizationId,
            siteId,
            localLocationId,
            reviewName,
            authorName,
            authorPhotoUrl,
            Math.round(rating),
            comment,
            createTime,
            now
          ])
          if (result.meta.changes > 0) {
            reviewsUpserted++
            // Only alert the owner for genuinely new rows — INSERT OR IGNORE means
            // changes === 0 for reviews we'd already synced on a prior run.
            // Also skip notifications for historical backfill (reviews older than 30 days)
            const reviewDate = new Date(createTime)
            const thirtyDaysAgo = new Date(now)
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
            const isHistorical = reviewDate < thirtyDaysAgo
            
            if (!isHistorical) {
              // Fire notification asynchronously to avoid blocking the sync loop
              notificationPromises.push(
                notifyReviewReceived(env, env.DB, {
                  organizationId,
                  siteId,
                  siteName: location.title,
                  locationId: localLocationId,
                  reviewId,
                  authorName,
                  rating: Math.round(rating),
                  content: comment,
                }).catch((error) => {
                  console.error('review_sync_notify_failed', { reviewId, error: error instanceof Error ? error.message : String(error) })
                })
              )
            }
          }
        }
      } catch {
        // Non-fatal: reviews sync failure should not abort location sync
      }
    }
  }

  // Await all pending notification promises before returning
  await Promise.allSettled(notificationPromises)

  return { reviewsUpserted }
}

// Generate URL-friendly slug from location title
function generateLocationSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'location'
}

// Generate canonical Google Maps embed URL based on best available data
export const calculateMapEmbedUrl = (loc: { 
  title: string; 
  maps_url?: string | null; 
  latitude?: number | null; 
  longitude?: number | null; 
  address?: string | null;
  city?: string | null;
}) => {
  // 1. CID from maps_url (specific GMB pin) - Best for business labels
  if (loc.maps_url) {
    try {
      const url = new URL(loc.maps_url)
      const cid = url.searchParams.get('cid')
      if (cid) {
        return `https://maps.google.com/maps?cid=${cid}&output=embed`
      }
    } catch (_e) { /* ignore */ }
  }

  // 2. Exact coordinates
  if (loc.latitude != null && loc.longitude != null) {
    return `https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}&output=embed`
  }

  // 3. Address line fallback (best to include title if available)
  let addr = loc.address || loc.city || ''
  if (addr.startsWith('{')) {
    try {
      const parsed = JSON.parse(addr)
      addr = parsed.addressLines?.[0] || parsed.streetAddress || loc.city || ''
    } catch { /* ignore */ }
  }

  if (addr) {
    const query = loc.title ? `${loc.title}, ${addr}` : addr
    return `https://maps.google.com/maps?q=${encodeURIComponent(String(query))}&output=embed`
  }
  return null
}
