import { timingSafeEqual } from 'node:crypto'

const textEncoder = new TextEncoder()

const base64UrlEncode = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

async function signPreviewPayload(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload))
  return base64UrlEncode(signature)
}

export async function createPreviewToken(secret: string, siteId: string, expiresAt: number) {
  const payload = `site:${siteId}.${expiresAt}`
  const signature = await signPreviewPayload(secret, payload)
  return `${expiresAt}.${signature}`
}

export async function createScopedPreviewToken(secret: string, scope: string, entityId: string, expiresAt: number) {
  const payload = `${scope}:${entityId}.${expiresAt}`
  const signature = await signPreviewPayload(secret, payload)
  return `${expiresAt}.${signature}`
}

export async function verifyPreviewToken(secret: string, siteId: string, token: string) {
  return verifyScopedPreviewToken(secret, 'site', siteId, token)
}

export async function verifyScopedPreviewToken(secret: string, scope: string, entityId: string, token: string) {
  const [expiresAtRaw, signature] = token.split('.')
  const expiresAt = Number(expiresAtRaw)

  if (!Number.isFinite(expiresAt) || !signature) return false
  if (Date.now() > expiresAt) return false

  const expected = await createScopedPreviewToken(secret, scope, entityId, expiresAt)

  const tokenBuf = textEncoder.encode(token)
  const expectedBuf = textEncoder.encode(expected)

  // Always compare equal-length buffers to avoid timing leaks
  if (tokenBuf.length !== expectedBuf.length) {
    // Perform a dummy comparison to prevent early exit timing differences
    timingSafeEqual(expectedBuf, expectedBuf)
    return false
  }

  return timingSafeEqual(tokenBuf, expectedBuf)
}
