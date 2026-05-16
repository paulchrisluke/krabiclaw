function bucket(env: ApiRecord): R2Bucket {
  if (!env.MEDIA_BUCKET) throw new Error('MEDIA_BUCKET binding not available')
  return env.MEDIA_BUCKET
}

function normalizeR2Key(key: string): string {
  const raw = String(key)
  if (!raw) throw new Error('Invalid key')
  if (raw.includes('\u0000')) throw new Error('Invalid key')
  if (raw.startsWith('/')) throw new Error('Invalid key')

  const parts = raw.split('/').filter(Boolean)
  if (!parts.length) throw new Error('Invalid key')

  const safeParts = parts.map((part) => {
    if (part === '.' || part === '..') throw new Error('Invalid key')
    if (!/^[A-Za-z0-9._-]+$/.test(part)) throw new Error('Invalid key')
    return part
  })

  return safeParts.join('/')
}

/** Upload a file to R2 and return its public CDN URL. */
export async function uploadToR2(
  env: ApiRecord,
  key: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream | Blob,
  contentType: string
): Promise<string> {
  const normalizedKey = normalizeR2Key(key)
  await bucket(env).put(normalizedKey, body, { httpMetadata: { contentType } })
  return getR2Url(env, normalizedKey)
}

/** Delete a file from R2. */
export async function deleteFromR2(env: ApiRecord, key: string): Promise<void> {
  const normalizedKey = normalizeR2Key(key)
  await bucket(env).delete(normalizedKey)
}

/** Build the public CDN URL for an R2 key. */
export function getR2Url(env: ApiRecord, key: string): string {
  const base = typeof env.MEDIA_BASE_URL === 'string' ? env.MEDIA_BASE_URL.trim() : ''
  if (!base) throw new Error('MEDIA_BASE_URL is required')
  const normalizedBase = base.replace(/\/+$/, '')
  const encodedKey = normalizeR2Key(key)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
  return `${normalizedBase}/${encodedKey}`
}

/** Generate a namespaced R2 key for a media asset. */
export function buildR2Key(siteId: string, assetId: string, filename: string): string {
  const sanitizeSegment = (value: string, label: string): string => {
    const trimmed = String(value).trim().replace(/^\/+|\/+$/g, '')
    if (!trimmed) throw new Error(`Invalid ${label}`)
    if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
      throw new Error(`Invalid ${label}`)
    }
    return trimmed
  }

  const safeSiteId = sanitizeSegment(siteId, 'siteId')
  const safeAssetId = sanitizeSegment(assetId, 'assetId')
  const safeFilename = sanitizeSegment(filename, 'filename')
  const dotIndex = safeFilename.lastIndexOf('.')
  const ext = dotIndex > 0 ? safeFilename.slice(dotIndex + 1) : ''
  return `sites/${safeSiteId}/media/${safeAssetId}${ext ? '.' + ext : ''}`
}
