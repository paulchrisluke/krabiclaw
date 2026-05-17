const TOKEN_TTL_DAYS = 30

export async function hashReservationCancelToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createReservationCancelToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  return { token, expiresAt }
}

export function readBearerToken(authHeader: string | undefined | null): string {
  const [scheme, token] = String(authHeader || '').split(/\s+/, 2)
  return scheme?.toLowerCase() === 'bearer' ? token || '' : ''
}
