// Production-ready encryption utilities for connector tokens
// Uses Web Crypto API AES-GCM for secure token storage

export interface EncryptionEnv {
  CONNECTOR_TOKEN_ENCRYPTION_KEY?: string
}

// Derive 256-bit AES key from base64-encoded key
async function getEncryptionKey(env: EncryptionEnv): Promise<CryptoKey> {
  const keyString = env.CONNECTOR_TOKEN_ENCRYPTION_KEY
  if (!keyString) {
    throw new Error('CONNECTOR_TOKEN_ENCRYPTION_KEY not set')
  }
  
  // Convert base64 to Uint8Array (32 bytes = 256 bits)
  const binaryString = atob(keyString)
  const keyBytes = new Uint8Array(32)
  for (let i = 0; i < Math.min(binaryString.length, 32); i++) {
    keyBytes[i] = binaryString.charCodeAt(i)
  }
  
  // Pad with zeros if key is too short
  for (let i = binaryString.length; i < 32; i++) {
    keyBytes[i] = 0
  }
  
  return globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

// Encrypt secret using AES-GCM
export async function encryptSecret(plaintext: string, env: EncryptionEnv): Promise<string> {
  const key = await getEncryptionKey(env)
  
  // Generate random 12-byte IV
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  
  // Encode plaintext
  const dataBytes = new TextEncoder().encode(plaintext)
  
  // Encrypt
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBytes
  )
  
  // Convert to base64 and format as versioned string
  const ivBase64 = btoa(String.fromCharCode(...iv))
  const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  
  return `v1:${ivBase64}:${cipherBase64}`
}

// Decrypt secret using AES-GCM
export async function decryptSecret(value: string, env: EncryptionEnv): Promise<string> {
  const key = await getEncryptionKey(env)
  
  // Parse versioned format
  const parts = value.split(':')
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted value format')
  }
  
  const ivBase64 = parts[1]
  const cipherBase64 = parts[2]
  
  if (!ivBase64 || !cipherBase64) {
    throw new Error('Invalid encrypted value format: missing IV or ciphertext')
  }
  
  // Decode base64
  const ivBinary = atob(ivBase64)
  const cipherBinary = atob(cipherBase64)
  const iv = new Uint8Array(ivBinary.split('').map(c => c.charCodeAt(0)))
  const encrypted = new Uint8Array(cipherBinary.split('').map(c => c.charCodeAt(0)))
  
  // Decrypt
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )
  
  return new TextDecoder().decode(decrypted)
}

// Self-test for encryption roundtrip
export async function testEncryption(env: EncryptionEnv): Promise<boolean> {
  try {
    const testText = 'test-secret-token-' + Date.now()
    const encrypted = await encryptSecret(testText, env)
    const decrypted = await decryptSecret(encrypted, env)
    
    return testText === decrypted
  } catch (error) {
    console.error('Encryption self-test failed:', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// HMAC-signed OAuth state helpers
// ---------------------------------------------------------------------------
// Format: <base64url-payload>.<base64url-signature>
// The payload is the base64url-encoded JSON of the state object.
// The signature is HMAC-SHA256 over the payload, keyed with
// CONNECTOR_TOKEN_ENCRYPTION_KEY (same env var as token encryption).

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
