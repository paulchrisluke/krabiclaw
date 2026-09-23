import type { D1Database } from '@cloudflare/workers-types'
import type { GoogleCredential } from '~/shared/site-settings'
import { execute, queryFirst } from '~/server/db'
import { decryptSecret, encryptSecret, encryptionEnv } from './encryption'

/**
 * The one Google account a site has connected, and nothing about what it is
 * connected *for*.
 *
 * Analytics and Search Console are separate products to the tenant — separate
 * rows, separate connect and disconnect, separate errors — and the credential
 * underneath is shared because Google issues one per account, not one per API.
 * Each product stores its own selection beside this record and reads the token
 * through it; neither owns it, and neither may disconnect the other by
 * clearing it. `releaseGoogleCredential` is the only thing that removes it,
 * and only once no product still needs it.
 *
 * Scopes are requested incrementally. Connecting Analytics asks for identity
 * and GA4 read; connecting Search Console later asks for Search Console and
 * site verification, with `include_granted_scopes`, so Google returns a token
 * carrying both and the stored union grows rather than being replaced. A
 * tenant who only ever connects Analytics is never asked to hand over their
 * Search Console.
 *
 * Reuses the same Google Cloud OAuth client as Better Auth login
 * (GOOGLE_CLIENT_ID/SECRET); only the redirect URI is dedicated, since that is
 * what routes the callback here rather than to Better Auth. Scopes are a
 * property of each authorization URL, not of the client, so this does not
 * widen what the login flow asks for.
 */
export interface GoogleCredentialEnv {
  DB: D1Database
  CONNECTOR_TOKEN_ENCRYPTION_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_INTEGRATIONS_REDIRECT_URI?: string
}

/** Which product a connect flow is for. Travels in the signed OAuth state. */
export type GoogleProduct = 'analytics' | 'search-console'

const IDENTITY_SCOPES = ['openid', 'email']

/**
 * What each product needs, and nothing more. Analytics reads GA4 and does not
 * touch Search Console; Search Console needs write access to add a property
 * and the verification scope to prove ownership without the tenant pasting a
 * token anywhere.
 */
export const GOOGLE_PRODUCT_SCOPES: Record<GoogleProduct, readonly string[]> = {
  'analytics': [
    ...IDENTITY_SCOPES,
    'https://www.googleapis.com/auth/analytics.readonly',
  ],
  'search-console': [
    ...IDENTITY_SCOPES,
    'https://www.googleapis.com/auth/webmasters',
    'https://www.googleapis.com/auth/siteverification',
  ],
}

export interface StoredGoogleCredential extends GoogleCredential {
  organization_id: string
}

export function googleAuthUrl(env: GoogleCredentialEnv, product: GoogleProduct, state: string): string {
  const clientId = env.GOOGLE_CLIENT_ID
  const redirectUri = env.GOOGLE_INTEGRATIONS_REDIRECT_URI
  if (!clientId || !redirectUri) throw new Error('Missing Google OAuth configuration')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_PRODUCT_SCOPES[product].join(' '),
    state,
    access_type: 'offline',
    // What makes the second product additive: Google returns a token carrying
    // the scopes already granted as well as the ones asked for now.
    include_granted_scopes: 'true',
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(
  env: GoogleCredentialEnv,
  code: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number; scope: string }> {
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const redirectUri = env.GOOGLE_INTEGRATIONS_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing Google OAuth configuration')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) throw new Error(`Google OAuth token exchange failed: ${(await response.text()).slice(0, 300)}`)

  const token = await response.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }
  return {
    accessToken: token.access_token,
    // Google withholds a refresh token when the account has already granted
    // this client offline access and is now adding a scope. The stored one
    // still works, so the caller keeps it rather than treating this as a
    // failure.
    refreshToken: token.refresh_token ?? null,
    expiresIn: token.expires_in,
    scope: token.scope,
  }
}

export async function googleUserEmail(accessToken: string): Promise<string> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Failed to fetch Google user info: ${response.status}`)
  const info = await response.json() as { email?: string }
  if (!info.email) throw new Error('Google user info did not return an email address')
  return info.email
}

const scopeUnion = (...sets: Array<string | null | undefined>) =>
  [...new Set(sets.flatMap(set => (set ?? '').split(/\s+/)).filter(Boolean))].sort().join(' ')

/**
 * Writes the credential, growing the granted scopes rather than replacing
 * them, and refusing when the row moved under the authorization that produced
 * it. A different Google account replaces the record outright: two accounts
 * are not one credential with more scopes.
 */
export async function storeGoogleCredential(
  env: GoogleCredentialEnv,
  input: {
    organization_id: string
    connected_by_user_id: string
    provider_account_email: string
    access_token: string
    refresh_token: string | null
    scopes: string
    expires_at?: string
  },
  expected: { revision: string | null },
): Promise<void> {
  if (!env.DB) throw new Error('Database not available')

  const existing = await readGoogleCredential(env, input.organization_id)
  const sameAccount = existing?.provider_account_email === input.provider_account_email
  const refreshToken = input.refresh_token ?? (sameAccount ? existing?.encrypted_refresh_token : null)
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token. Remove KrabiClaw from your Google account permissions and connect again.')
  }

  const now = new Date().toISOString()
  const tokenEnv = encryptionEnv(env)
  const payload = JSON.stringify({
    id: existing && sameAccount ? existing.id : `google-credential-${input.organization_id}`,
    revision: crypto.randomUUID(),
    connected_by_user_id: input.connected_by_user_id,
    provider_account_email: input.provider_account_email,
    encrypted_access_token: await encryptSecret(input.access_token, tokenEnv),
    encrypted_refresh_token: await encryptSecret(refreshToken, tokenEnv),
    scopes: sameAccount ? scopeUnion(existing?.scopes, input.scopes) : scopeUnion(input.scopes),
    status: 'active',
    expires_at: input.expires_at,
    created_at: sameAccount && existing?.created_at ? existing.created_at : now,
    updated_at: now,
  })

  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.google_credential', json(?))
    WHERE id = ?
      AND json_extract(integrations_json, '$.google_credential.revision') IS ?
  `, [payload, input.organization_id, expected.revision])
  if (result.meta?.changes !== 1) {
    throw new Error('The site or its Google connection changed during authorization. Try again.')
  }
}

export async function readGoogleCredential(
  env: GoogleCredentialEnv,
  organizationId: string,
): Promise<StoredGoogleCredential | null> {
  if (!env.DB) return null
  const row = await queryFirst<StoredGoogleCredential>(env.DB, `
    SELECT id AS organization_id,
           json_extract(integrations_json, '$.google_credential.id') AS id,
           json_extract(integrations_json, '$.google_credential.revision') AS revision,
           json_extract(integrations_json, '$.google_credential.connected_by_user_id') AS connected_by_user_id,
           json_extract(integrations_json, '$.google_credential.provider_account_email') AS provider_account_email,
           json_extract(integrations_json, '$.google_credential.encrypted_access_token') AS encrypted_access_token,
           json_extract(integrations_json, '$.google_credential.encrypted_refresh_token') AS encrypted_refresh_token,
           json_extract(integrations_json, '$.google_credential.scopes') AS scopes,
           json_extract(integrations_json, '$.google_credential.status') AS status,
           json_extract(integrations_json, '$.google_credential.expires_at') AS expires_at,
           json_extract(integrations_json, '$.google_credential.created_at') AS created_at,
           json_extract(integrations_json, '$.google_credential.updated_at') AS updated_at
      FROM organization
     WHERE id = ?
       AND json_extract(integrations_json, '$.google_credential.status') = 'active'
     LIMIT 1
  `, [organizationId])
  if (!row) return null

  const tokenEnv = encryptionEnv(env)
  row.encrypted_access_token = await decryptSecret(row.encrypted_access_token, tokenEnv)
  row.encrypted_refresh_token = await decryptSecret(row.encrypted_refresh_token, tokenEnv)
  return row
}

/** Whether the credential carries every scope a product needs, without asking Google. */
export function credentialGrants(credential: Pick<GoogleCredential, 'scopes'>, product: GoogleProduct): boolean {
  const granted = new Set((credential.scopes ?? '').split(/\s+/).filter(Boolean))
  return GOOGLE_PRODUCT_SCOPES[product].every(scope => granted.has(scope))
}

export async function googleAccessToken(
  env: GoogleCredentialEnv,
  organizationId: string,
): Promise<string> {
  const credential = await readGoogleCredential(env, organizationId)
  if (!credential) throw new Error('No Google account is connected to this site.')
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Missing Google OAuth client configuration.')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: credential.encrypted_refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) throw new Error(`Could not refresh the Google token: ${(await response.text()).slice(0, 300)}`)

  const token = await response.json() as { access_token?: string }
  if (!token.access_token) throw new Error('Google token response did not include access_token.')
  return token.access_token
}

/**
 * Drops the shared credential once neither product is connected any more, and
 * tells Google to forget it. Disconnecting one product calls this; the other
 * product still being there is what keeps the credential alive, so neither
 * disconnect can take the other down with it.
 */
export async function releaseGoogleCredential(
  env: GoogleCredentialEnv,
  organizationId: string,
): Promise<string | null> {
  if (!env.DB) return null
  const remaining = await queryFirst<{ analytics: string | null; search_console: string | null }>(env.DB, `
    SELECT json_extract(integrations_json, '$.google_analytics') AS analytics,
           json_extract(integrations_json, '$.google_search_console') AS search_console
      FROM organization WHERE id = ? LIMIT 1
  `, [organizationId])
  if (!remaining || remaining.analytics || remaining.search_console) return null

  const credential = await readGoogleCredential(env, organizationId)
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_remove(integrations_json, '$.google_credential')
    WHERE id = ?
      AND json_extract(integrations_json, '$.google_analytics') IS NULL
      AND json_extract(integrations_json, '$.google_search_console') IS NULL
  `, [organizationId])
  if (result.meta?.changes !== 1 || !credential) return null

  // Deliberately after the row is gone: a revoke Google refuses must not leave
  // the tenant holding a credential they asked us to drop. The caller is told
  // rather than the failure disappearing into a log.
  const response = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(credential.encrypted_refresh_token)}`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } },
  ).catch((error: unknown) => error instanceof Error ? error : new Error(String(error)))

  return response instanceof Error || !response.ok
    ? 'the Google account authorization could not be revoked at Google'
    : null
}
