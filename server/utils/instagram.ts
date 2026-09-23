import type { D1Database } from '@cloudflare/workers-types'
import type { InstagramIntegration } from '~/shared/site-settings'
import { execute, queryFirst } from '~/server/db'
import { decryptSecret, encryptSecret, encryptionEnv } from './encryption'

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

/** Short-lived token plus the account it belongs to. */
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

  const token = await response.json() as { access_token?: string; user_id?: number | string }
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

  const token = await response.json() as { access_token?: string; expires_in?: number }
  if (!token.access_token) throw new Error('Instagram did not return a long-lived access token')
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + (token.expires_in ?? 0) * 1000).toISOString(),
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
    username: string
    access_token: string
    token_expires_at?: string
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

export async function readInstagramConnection(
  env: InstagramEnv,
  organizationId: string,
): Promise<InstagramConnection | null> {
  if (!env.DB) return null
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
       AND json_extract(integrations_json, '$.instagram.status') = 'active'
     LIMIT 1
  `, [organizationId])
  if (!row) return null
  row.encrypted_access_token = await decryptSecret(row.encrypted_access_token, encryptionEnv(env))
  return row
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
