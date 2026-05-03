export interface GoogleBusinessEnv {
  REVIEWS_DB: D1Database
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_BUSINESS_ACCOUNT_ID?: string
  GOOGLE_BUSINESS_LOCATION_ID?: string
  GOOGLE_PUBSUB_TOPIC?: string
}

export interface GoogleBusinessSyncResult {
  syncedAt: string
  business: unknown
  reviews: unknown[]
  media: unknown[]
  posts: unknown[]
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

  return response.json<T>()
}

const googlePatch = async <T>(url: string, accessToken: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`)
  }

  return response.json<T>()
}

export const locationName = (env: GoogleBusinessEnv) => {
  const locationId = env.GOOGLE_BUSINESS_LOCATION_ID?.trim()
  if (!locationId) return ''
  return locationId.startsWith('locations/') ? locationId : `locations/${locationId}`
}

export const getGoogleRefreshToken = async (env: GoogleBusinessEnv) => {
  const row = await env.REVIEWS_DB.prepare(
    `SELECT refresh_token AS refreshToken FROM google_oauth_tokens WHERE provider = 'google'`
  ).first<{ refreshToken: string }>()
  return row?.refreshToken ?? ''
}

export const saveGoogleRefreshToken = async (env: GoogleBusinessEnv, refreshToken: string, scope = '') => {
  if (!refreshToken) return
  await env.REVIEWS_DB.prepare(
    `INSERT INTO google_oauth_tokens (provider, refresh_token, scope)
     VALUES ('google', ?, ?)
     ON CONFLICT(provider) DO UPDATE SET
       refresh_token = excluded.refresh_token,
       scope = excluded.scope,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).bind(refreshToken, scope).run()
}

export const getGoogleAccessToken = async (env: GoogleBusinessEnv) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing Google OAuth client configuration.')
  }

  const refreshToken = await getGoogleRefreshToken(env)
  if (!refreshToken) {
    throw new Error('No Google refresh token stored. Sign in through /admin/reviews first.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Could not refresh Google token: ${text.slice(0, 300)}`)
  }

  const token = await response.json<{ access_token?: string }>()
  if (!token.access_token) throw new Error('Google token response did not include access_token.')
  return token.access_token
}

export const syncGoogleBusiness = async (env: GoogleBusinessEnv): Promise<GoogleBusinessSyncResult> => {
  const accessToken = await getGoogleAccessToken(env)
  const accountId = env.GOOGLE_BUSINESS_ACCOUNT_ID?.trim()
  const locName = locationName(env)
  const errors: GoogleBusinessSyncResult['errors'] = []
  let business: unknown = null
  let reviews: unknown[] = []
  let media: unknown[] = []
  let posts: unknown[] = []

  if (!accountId || !locName) {
    throw new Error('Missing GOOGLE_BUSINESS_ACCOUNT_ID or GOOGLE_BUSINESS_LOCATION_ID.')
  }

  const readMask = [
    'name',
    'title',
    'profile',
    'storefrontAddress',
    'phoneNumbers',
    'websiteUri',
    'regularHours',
    'categories',
    'latlng',
    'metadata'
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
    const response = await googleJson<{ reviews?: unknown[] }>(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/${locName}/reviews?pageSize=50`,
      accessToken
    )
    reviews = response.reviews ?? []
  } catch (error) {
    errors.push({ source: 'reviews', message: error instanceof Error ? error.message : String(error) })
  }

  try {
    const response = await googleJson<{ mediaItems?: unknown[] }>(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/${locName}/media?pageSize=50`,
      accessToken
    )
    media = response.mediaItems ?? []
  } catch (error) {
    errors.push({ source: 'media', message: error instanceof Error ? error.message : String(error) })
  }

  try {
    const response = await googleJson<{ localPosts?: unknown[] }>(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/${locName}/localPosts?pageSize=20`,
      accessToken
    )
    posts = response.localPosts ?? []
  } catch (error) {
    errors.push({ source: 'posts', message: error instanceof Error ? error.message : String(error) })
  }

  const syncedAt = new Date().toISOString()
  await env.REVIEWS_DB.prepare(
    `INSERT INTO google_business_snapshots (id, business_json, reviews_json, media_json, posts_json, errors_json, synced_at)
     VALUES ('current', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       business_json = excluded.business_json,
       reviews_json = excluded.reviews_json,
       media_json = excluded.media_json,
       posts_json = excluded.posts_json,
       errors_json = excluded.errors_json,
       synced_at = excluded.synced_at`
  ).bind(
    JSON.stringify(business),
    JSON.stringify(reviews),
    JSON.stringify(media),
    JSON.stringify(posts),
    JSON.stringify(errors),
    syncedAt
  ).run()

  return { syncedAt, business, reviews, media, posts, errors }
}

export const getGoogleBusinessSnapshot = async (env: GoogleBusinessEnv) => {
  const row = await env.REVIEWS_DB.prepare(
    `SELECT business_json AS businessJson,
            reviews_json AS reviewsJson,
            media_json AS mediaJson,
            posts_json AS postsJson,
            errors_json AS errorsJson,
            synced_at AS syncedAt
     FROM google_business_snapshots
     WHERE id = 'current'`
  ).first<{
    businessJson: string | null
    reviewsJson: string | null
    mediaJson: string | null
    postsJson: string | null
    errorsJson: string | null
    syncedAt: string
  }>()

  if (!row) return null

  return {
    business: row.businessJson ? JSON.parse(row.businessJson) : null,
    reviews: row.reviewsJson ? JSON.parse(row.reviewsJson) : [],
    media: row.mediaJson ? JSON.parse(row.mediaJson) : [],
    posts: row.postsJson ? JSON.parse(row.postsJson) : [],
    errors: row.errorsJson ? JSON.parse(row.errorsJson) : [],
    syncedAt: row.syncedAt
  }
}

export const updateNotificationSetting = async (env: GoogleBusinessEnv) => {
  const accountId = env.GOOGLE_BUSINESS_ACCOUNT_ID?.trim()
  const pubsubTopic = env.GOOGLE_PUBSUB_TOPIC?.trim()
  if (!accountId || !pubsubTopic) {
    throw new Error('Missing GOOGLE_BUSINESS_ACCOUNT_ID or GOOGLE_PUBSUB_TOPIC.')
  }

  const accessToken = await getGoogleAccessToken(env)
  return googlePatch(
    `https://mybusinessnotifications.googleapis.com/v1/accounts/${accountId}/notificationSetting?updateMask=pubsubTopic,notificationTypes`,
    accessToken,
    {
      name: `accounts/${accountId}/notificationSetting`,
      pubsubTopic,
      notificationTypes: [
        'GOOGLE_UPDATE',
        'NEW_REVIEW',
        'UPDATED_REVIEW',
        'NEW_CUSTOMER_MEDIA',
        'VOICE_OF_MERCHANT_UPDATED'
      ]
    }
  )
}
