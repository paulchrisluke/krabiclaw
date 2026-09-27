// ---------------------------------------------------------------------------
// HMAC-signed tokens
// ---------------------------------------------------------------------------
// Format: <base64url-payload>.<base64url-signature>
// The payload is the base64url-encoded JSON of the signed object.
// The signature is HMAC-SHA256 over the payload, keyed with
// CONNECTOR_TOKEN_ENCRYPTION_KEY. Meta's data-deletion confirmation code is
// one: the status URL verifies it rather than reading back a stored record.

function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  const binary = atob(padded)
  return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)))
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(secret)
  return globalThis.crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  )
}

export async function signOAuthState(secret: string, payload: object): Promise<string> {
  if (!secret) throw new Error('CONNECTOR_TOKEN_ENCRYPTION_KEY is not set')
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const payloadB64 = base64urlEncode(payloadBytes)
  const key = await getHmacKey(secret)
  const sigBuffer = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  const sigB64 = base64urlEncode(new Uint8Array(sigBuffer))
  return `${payloadB64}.${sigB64}`
}

export async function verifyOAuthState<T = ApiRecord>(
  secret: string, signed: string
): Promise<T | null> {
  if (!secret) return null
  const dot = signed.lastIndexOf('.')
  if (dot === -1) return null
  const payloadB64 = signed.slice(0, dot)
  const sigB64 = signed.slice(dot + 1)
  try {
    const key = await getHmacKey(secret)
    const expectedSig = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
    const providedSig = base64urlDecode(sigB64)
    // Constant-time comparison
    const expected = new Uint8Array(expectedSig)
    if (expected.length !== providedSig.length) return null
    let diff = 0
    for (let i = 0; i < expected.length; i++) {
      const expectedByte = expected[i] ?? 0
      const providedByte = providedSig[i] ?? 0
      diff |= expectedByte ^ providedByte
    }
    if (diff !== 0) return null
    const payloadBytes = base64urlDecode(payloadB64)
    return JSON.parse(new TextDecoder().decode(payloadBytes)) as T
  } catch {
    return null
  }
}
