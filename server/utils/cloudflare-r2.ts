function bucket(env: Record<string, any>): R2Bucket {
  if (!env.MEDIA_BUCKET) throw new Error('MEDIA_BUCKET binding not available')
  return env.MEDIA_BUCKET
}

/** Upload a file to R2 and return its public CDN URL. */
export async function uploadToR2(
  env: Record<string, any>,
  key: string,
  body: ArrayBuffer | ReadableStream | Blob,
  contentType: string
): Promise<string> {
  await bucket(env).put(key, body, { httpMetadata: { contentType } })
  return getR2Url(env, key)
}

/** Delete a file from R2. */
export async function deleteFromR2(env: Record<string, any>, key: string): Promise<void> {
  await bucket(env).delete(key)
}

/** Build the public CDN URL for an R2 key. */
export function getR2Url(env: Record<string, any>, key: string): string {
  const base = typeof env.MEDIA_BASE_URL === 'string' ? env.MEDIA_BASE_URL.trim() : ''
  if (!base) throw new Error('MEDIA_BASE_URL is required')
  const normalizedBase = base.replace(/\/+$/, '')
  const encodedKey = String(key)
    .split('/')
    .filter(segment => segment.length > 0)
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
