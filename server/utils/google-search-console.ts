import type { GoogleSearchConsoleIntegration } from '~/shared/site-settings'
import { execute, queryFirst } from '~/server/db'
import { googleAccessToken, type GoogleCredentialEnv } from './google-credential'

/**
 * Search Console as a product of its own, over the shared Google credential.
 *
 * The tenant never pastes a verification token. KrabiClaw controls the site's
 * public HTML, so it can do what a verification token is for: Google issues
 * the token, the site serves it as `<meta name="google-site-verification">`,
 * Google fetches the page and confirms, and the property is added. The token
 * is stored only for as long as it must keep being served.
 */

export interface SearchConsoleSite {
  siteUrl: string
  permissionLevel: string
}

const googleJson = async <T>(url: string, accessToken: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}`)
  }
  return response.status === 204 ? (undefined as T) : (await response.json()) as T
}

/** The properties the connected account already owns, which need no verification. */
export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSite[]> {
  const response = await googleJson<{ siteEntry?: SearchConsoleSite[] }>(
    'https://www.googleapis.com/webmasters/v3/sites', accessToken,
  )
  return (response.siteEntry ?? []).filter(site =>
    site.permissionLevel === 'siteOwner' || site.permissionLevel === 'siteFullUser')
}

/**
 * Asks Google for this site's META verification token. The same URL-prefix
 * property always gets the same token back, so calling it again while a
 * verification is in flight is safe.
 */
export async function requestVerificationToken(accessToken: string, siteUrl: string): Promise<string> {
  const response = await googleJson<{ token?: string }>(
    'https://www.googleapis.com/siteVerification/v1/token', accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        verificationMethod: 'META',
        site: { type: 'SITE', identifier: siteUrl },
      }),
    },
  )
  // Google returns the whole tag; the content attribute is what the page needs.
  const token = response.token ?? ''
  const content = /content=["']([^"']+)["']/.exec(token)?.[1] ?? token
  if (!content) throw new Error('Google did not return a site verification token')
  return content
}

/** Tells Google to fetch the page and confirm the tag it issued is being served. */
export async function verifySiteOwnership(accessToken: string, siteUrl: string): Promise<void> {
  await googleJson('https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META', accessToken, {
    method: 'POST',
    body: JSON.stringify({ site: { type: 'SITE', identifier: siteUrl } }),
  })
}

/** Adds the property to Search Console. Verification must already have passed. */
export async function addSearchConsoleSite(accessToken: string, siteUrl: string): Promise<void> {
  await googleJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`, accessToken, {
    method: 'PUT',
  })
}

export async function readSearchConsoleIntegration(
  env: GoogleCredentialEnv,
  organizationId: string,
): Promise<GoogleSearchConsoleIntegration | null> {
  const row = await queryFirst<Omit<GoogleSearchConsoleIntegration, 'verified'> & { verified: number }>(env.DB, `
    SELECT json_extract(integrations_json, '$.google_search_console.revision') AS revision,
           json_extract(integrations_json, '$.google_search_console.site_url') AS site_url,
           json_extract(integrations_json, '$.google_search_console.verified') AS verified,
           json_extract(integrations_json, '$.google_search_console.verification_token') AS verification_token,
           json_extract(integrations_json, '$.google_search_console.status') AS status,
           json_extract(integrations_json, '$.google_search_console.created_at') AS created_at,
           json_extract(integrations_json, '$.google_search_console.updated_at') AS updated_at
      FROM organization
     WHERE id = ?
       AND json_extract(integrations_json, '$.google_search_console') IS NOT NULL
     LIMIT 1
  `, [organizationId])
  return row ? { ...row, verified: Boolean(row.verified) } : null
}

/**
 * Persists the verification token before Google is asked to look for it. The
 * page has to be serving the tag by the time the fetch arrives, so the write
 * and the public cache purge come first and the verify call second.
 */
export async function storeVerificationToken(
  env: GoogleCredentialEnv,
  organizationId: string,
  siteUrl: string,
  token: string,
): Promise<void> {
  if (!env.DB) throw new Error('Database not available')
  const now = new Date().toISOString()
  const payload = JSON.stringify({
    revision: crypto.randomUUID(),
    site_url: siteUrl,
    verified: false,
    verification_token: token,
    status: 'active',
    created_at: now,
    updated_at: now,
  })
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.google_search_console',
      json_set(json(?), '$.created_at', COALESCE(json_extract(integrations_json, '$.google_search_console.created_at'), ?)))
    WHERE id = ?
  `, [payload, now, organizationId])
  if (result.meta?.changes !== 1) throw new Error('Site ownership changed. Reload before connecting.')
}

/**
 * Records the connected property. A property KrabiClaw verified keeps its
 * token, because Google re-checks the tag and drops ownership if it stops
 * being served; one the account already owned never had a token here.
 */
export async function storeSearchConsoleSelection(
  env: GoogleCredentialEnv,
  organizationId: string,
  siteUrl: string,
  verificationToken: string | null,
): Promise<void> {
  if (!env.DB) throw new Error('Database not available')
  const now = new Date().toISOString()
  const payload = JSON.stringify({
    revision: crypto.randomUUID(),
    site_url: siteUrl,
    verified: true,
    ...(verificationToken ? { verification_token: verificationToken } : {}),
    status: 'active',
    created_at: now,
    updated_at: now,
  })
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.google_search_console',
      json_set(json(?), '$.created_at', COALESCE(json_extract(integrations_json, '$.google_search_console.created_at'), ?)))
    WHERE id = ?
  `, [payload, now, organizationId])
  if (result.meta?.changes !== 1) throw new Error('Site ownership changed. Reload before saving.')
}

/** Clears Search Console state. The shared credential is not this function's to touch. */
export async function clearSearchConsoleIntegration(
  env: GoogleCredentialEnv,
  organizationId: string,
): Promise<void> {
  if (!env.DB) throw new Error('Database not available')
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_remove(integrations_json, '$.google_search_console')
    WHERE id = ?
  `, [organizationId])
  if (result.meta?.changes !== 1) throw new Error('Site ownership changed. Reload before disconnecting.')
}

/**
 * The whole automated verification, in the order the outside world requires:
 * ask for the token, serve it, have Google look, then add the property.
 * `publish` is what makes the tag reachable — the public cache purge — and is
 * awaited before Google is asked to fetch.
 */
export async function verifyAndAddProperty(
  env: GoogleCredentialEnv,
  organizationId: string,
  siteUrl: string,
  publish: () => Promise<void>,
): Promise<void> {
  const accessToken = await googleAccessToken(env, organizationId)
  const token = await requestVerificationToken(accessToken, siteUrl)
  await storeVerificationToken(env, organizationId, siteUrl, token)
  await publish()
  await verifySiteOwnership(accessToken, siteUrl)
  await addSearchConsoleSite(accessToken, siteUrl)
  await storeSearchConsoleSelection(env, organizationId, siteUrl, token)
}
