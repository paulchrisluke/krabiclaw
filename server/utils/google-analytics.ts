import type { IntegrationVersion, GoogleOAuthIntegration } from '~/shared/site-settings'
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

export interface GoogleAnalyticsConnection extends Omit<GoogleOAuthIntegration, 'kind' | 'revision'>, IntegrationVersion {
  organization_id: string
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
    connected_by_user_id: string
    provider_account_email: string
    encrypted_access_token: string
    encrypted_refresh_token: string
    scopes: string
    expires_at?: string
    status: 'active' | 'disabled' | 'error'
  },
  expected: IntegrationVersion
): Promise<string> => {
  if (!env.DB) {
    throw new Error('Database not available')
  }

  const connectionId = `ga-connection-${connection.organization_id}-${connection.organization_id}`
  const now = new Date().toISOString()
  const tokenEnv = encryptionEnv(env)

  const encryptedAccessToken = await encryptSecret(connection.encrypted_access_token, tokenEnv)
  const encryptedRefreshToken = await encryptSecret(connection.encrypted_refresh_token, tokenEnv)

  const { organization_id: organizationId, ...providerState } = connection
  const payload = JSON.stringify({
    ...providerState, id: connectionId, kind: 'oauth', revision: crypto.randomUUID(),
    encrypted_access_token: encryptedAccessToken,
    encrypted_refresh_token: encryptedRefreshToken, updated_at: now,
  })
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.google',
      json_set(json_patch(CASE WHEN json_extract(integrations_json, '$.google.kind') = 'oauth' AND json_extract(integrations_json, '$.google.provider_account_email') = ?
                             THEN json_extract(integrations_json, '$.google') ELSE '{}' END, json(?)),
        '$.created_at', COALESCE(json_extract(integrations_json, '$.google.created_at'), ?)))
    WHERE id = ? AND organization_id = ?
      AND json_extract(integrations_json, '$.google.revision') IS ?
  `, [connection.provider_account_email, payload, now, organizationId, expected.revision])
  if (result.meta?.changes !== 1) throw new Error('Site ownership or google connection changed during authorization')

  return connectionId
}

// Get Google Analytics connection with decrypted tokens
export const getGoogleAnalyticsConnection = async (
  env: GoogleAnalyticsEnv,
  organizationId: string,
): Promise<GoogleAnalyticsConnection | null> => {
  if (!env.DB) {
    return null
  }

  const connection = await queryFirst<GoogleAnalyticsConnection>(env.DB, `
    SELECT id AS organization_id, organization_id,
           json_extract(integrations_json, '$.google.id') AS id,
           json_extract(integrations_json, '$.google.revision') AS revision,
           json_extract(integrations_json, '$.google.connected_by_user_id') AS connected_by_user_id,
           json_extract(integrations_json, '$.google.provider_account_email') AS provider_account_email,
           json_extract(integrations_json, '$.google.encrypted_access_token') AS encrypted_access_token,
           json_extract(integrations_json, '$.google.encrypted_refresh_token') AS encrypted_refresh_token,
           json_extract(integrations_json, '$.google.scopes') AS scopes,
           json_extract(integrations_json, '$.google.ga4_property_id') AS ga4_property_id,
           json_extract(integrations_json, '$.google.ga4_property_name') AS ga4_property_name,
           json_extract(integrations_json, '$.google.ga4_measurement_id') AS ga4_measurement_id,
           json_extract(integrations_json, '$.google.search_console_site_url') AS search_console_site_url,
           json_extract(integrations_json, '$.google.status') AS status,
           json_extract(integrations_json, '$.google.expires_at') AS expires_at,
           json_extract(integrations_json, '$.google.created_at') AS created_at,
           json_extract(integrations_json, '$.google.updated_at') AS updated_at
      FROM organization
     WHERE organization_id = ? AND id = ?
       AND json_extract(integrations_json, '$.google.kind') = 'oauth'
       AND json_extract(integrations_json, '$.google.status') = 'active'
     LIMIT 1
  `, [organizationId])

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
): Promise<string> => {
  const connection = await getGoogleAnalyticsConnection(env, organizationId)
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
