import { $fetch } from 'ofetch'

export function googleSignInOptions(callbackURL?: string, loginHint?: string) {
  return {
    provider: 'google' as const,
    ...(loginHint ? { loginHint } : {}),
    ...(callbackURL ? { callbackURL } : {}),
  }
}

export function oauthContinuationDestination(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  if ('url' in data && typeof data.url === 'string') return data.url
  if ('redirect_uri' in data && typeof data.redirect_uri === 'string') return data.redirect_uri
  return ''
}

/**
 * The registered client's display name and logo for the sign-in and consent
 * banners. Both screens asked the same endpoint the same way and narrowed the
 * snake_case response inline; this is that one read.
 *
 * Null means the request had no client to look up, or the lookup failed. Both
 * screens show their generic copy for that — the banner is omitted, never
 * filled with a stand-in name.
 */
export interface OAuthClientPrelogin {
  clientName: string | null
  logoUri: string | null
}

export async function fetchOAuthClientPrelogin(clientId: unknown, oauthQuery: string): Promise<OAuthClientPrelogin | null> {
  // ofetch resolves no base URL, so the relative path only works in a browser.
  // Saying that here beats a server caller getting "Failed to parse URL" back
  // through the catch below as an indistinguishable null.
  if (!import.meta.client) throw new Error('fetchOAuthClientPrelogin runs in the browser only')
  if (typeof clientId !== 'string' || !clientId) return null
  let data: unknown
  try {
    data = await $fetch('/api/auth/oauth2/public-client-prelogin', {
      method: 'POST',
      body: { client_id: clientId, oauth_query: oauthQuery },
    })
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  return {
    clientName: 'client_name' in data && typeof data.client_name === 'string' && data.client_name ? data.client_name : null,
    logoUri: 'logo_uri' in data && typeof data.logo_uri === 'string' && data.logo_uri ? data.logo_uri : null,
  }
}
