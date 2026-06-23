import type { D1Database } from '@cloudflare/workers-types'
import { execute, queryFirst } from '~/server/db'
import { encryptSecret, decryptSecret, encryptionEnv } from './encryption'

// Reuses the same Google Cloud OAuth client as Better Auth login (GOOGLE_CLIENT_ID/SECRET) —
// only the redirect URI is dedicated, since that's what routes the callback to this flow's
// handler rather than Better Auth's. OAuth scopes are requested per-authorization-URL, not
// pinned to the client, so this doesn't affect what scopes the login flow asks for.
export interface GoogleAnalyticsEnv {
  DB: D1Database
  CONNECTOR_TOKEN_ENCRYPTION_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_ANALYTICS_REDIRECT_URI?: string
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

export interface GoogleAnalyticsConnection {
  id: string
  organization_id: string
  site_id: string
  connected_by_user_id?: string
  provider_account_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  scopes: string
  ga4_property_id?: string
  ga4_property_name?: string
  ga4_measurement_id?: string
  search_console_site_url?: string
  status: 'active' | 'disabled' | 'error'
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface Ga4Property {
  accountName: string
  propertyId: string
  propertyName: string
}

export interface SearchConsoleSite {
  siteUrl: string
  permissionLevel: string
}

// Generate OAuth authorization URL
export const getGoogleAnalyticsAuthUrl = (env: GoogleAnalyticsEnv, state: string): string => {
  const clientId = env.GOOGLE_CLIENT_ID
  const redirectUri = env.GOOGLE_ANALYTICS_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('Missing Google Analytics OAuth configuration')
  }

  const scopes = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly'
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent select_account'
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// Exchange OAuth code for tokens
export const exchangeGoogleAnalyticsCode = async (
  env: GoogleAnalyticsEnv,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> => {
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const redirectUri = env.GOOGLE_ANALYTICS_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google Analytics OAuth configuration')
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

// Store encrypted Google Analytics connection
export const storeGoogleAnalyticsConnection = async (
  env: GoogleAnalyticsEnv,
  connection: {
    organization_id: string
    site_id: string
    connected_by_user_id: string
    provider_account_email: string
    encrypted_access_token: string
    encrypted_refresh_token: string
    scopes: string
    expires_at?: string
    status: 'active' | 'disabled' | 'error'
  }
): Promise<string> => {
  if (!env.DB) {
    throw new Error('Database not available')
  }

  const connectionId = `ga-connection-${connection.organization_id}-${connection.site_id}`
  const now = new Date().toISOString()
  const tokenEnv = encryptionEnv(env)

  const encryptedAccessToken = await encryptSecret(connection.encrypted_access_token, tokenEnv)
  const encryptedRefreshToken = await encryptSecret(connection.encrypted_refresh_token, tokenEnv)

  await execute(env.DB, `
    INSERT INTO google_analytics_connections
    (id, organization_id, site_id, connected_by_user_id, provider_account_email,
     encrypted_access_token, encrypted_refresh_token, scopes, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, site_id) DO UPDATE SET
      connected_by_user_id = excluded.connected_by_user_id,
      provider_account_email = excluded.provider_account_email,
      encrypted_access_token = excluded.encrypted_access_token,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      scopes = excluded.scopes,
      status = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `, [
    connectionId,
    connection.organization_id,
    connection.site_id,
    connection.connected_by_user_id,
    connection.provider_account_email,
    encryptedAccessToken,
    encryptedRefreshToken,
    connection.scopes,
    connection.status,
    connection.expires_at ?? null,
    now,
    now
  ])

  return connectionId
}

// Get Google Analytics connection with decrypted tokens
export const getGoogleAnalyticsConnection = async (
  env: GoogleAnalyticsEnv,
  organizationId: string,
  siteId: string
): Promise<GoogleAnalyticsConnection | null> => {
  if (!env.DB) {
    return null
  }

  const connection = await queryFirst<GoogleAnalyticsConnection>(env.DB, `
    SELECT * FROM google_analytics_connections
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
    LIMIT 1
  `, [organizationId, siteId])

  if (!connection) {
    return null
  }

  const tokenEnv = encryptionEnv(env)
  connection.encrypted_access_token = await decryptSecret(connection.encrypted_access_token, tokenEnv)
  connection.encrypted_refresh_token = await decryptSecret(connection.encrypted_refresh_token, tokenEnv)

  return connection
}

// Get a fresh access token for a site's connection using its stored refresh token
export const getGoogleAnalyticsAccessToken = async (
  env: GoogleAnalyticsEnv,
  organizationId: string,
  siteId: string
): Promise<string> => {
  const connection = await getGoogleAnalyticsConnection(env, organizationId, siteId)
  if (!connection) {
    throw new Error('No Google Analytics connection found for this site.')
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing Google Analytics OAuth client configuration.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.encrypted_refresh_token,
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

// List GA4 properties the connected account has access to
export const listGa4Properties = async (accessToken: string): Promise<Ga4Property[]> => {
  const response = await googleJson<{
    accountSummaries?: Array<{
      account: string
      displayName: string
      propertySummaries?: Array<{ property: string; displayName: string }>
    }>
  }>('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', accessToken)

  const properties: Ga4Property[] = []
  for (const account of response.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      properties.push({
        accountName: account.displayName,
        propertyId: property.property.replace(/^properties\//, ''),
        propertyName: property.displayName
      })
    }
  }
  return properties
}

// Derive the GA4 web data stream's Measurement ID for a property — this is what
// lets the dashboard skip asking the user to find/copy a "G-XXXXXXX" ID themselves.
export const getGa4MeasurementId = async (accessToken: string, propertyId: string): Promise<string | null> => {
  const response = await googleJson<{
    dataStreams?: Array<{ webStreamData?: { measurementId?: string } }>
  }>(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams?pageSize=200`, accessToken)

  for (const stream of response.dataStreams ?? []) {
    if (stream.webStreamData?.measurementId) {
      return stream.webStreamData.measurementId
    }
  }
  return null
}

// List Search Console properties the connected account has verified ownership of
export const listSearchConsoleSites = async (accessToken: string): Promise<SearchConsoleSite[]> => {
  const response = await googleJson<{
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>
  }>('https://www.googleapis.com/webmasters/v3/sites', accessToken)

  return (response.siteEntry ?? []).filter((site) =>
    site.permissionLevel === 'siteOwner' || site.permissionLevel === 'siteFullUser'
  )
}
