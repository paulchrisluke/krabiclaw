import { timingSafeEqual } from 'node:crypto'

const textEncoder = new TextEncoder()
const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes

const base64UrlEncode = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

async function signActivationPayload(secret: string, payload: string) {
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

export async function createMediaActivationToken(secret: string, assetId: string, siteId: string) {
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const payload = `${assetId}.${siteId}.${expiresAt}`
  const signature = await signActivationPayload(secret, payload)
  return `${expiresAt}.${signature}`
}

export async function verifyMediaActivationToken(secret: string, assetId: string, siteId: string, token: string) {
  const [expiresAtRaw, signature] = token.split('.')
  const expiresAt = Number(expiresAtRaw)

  if (!Number.isFinite(expiresAt) || !signature) return false
  if (Date.now() > expiresAt) return false

  const expected = await createMediaActivationToken(secret, assetId, siteId)

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
