import { HTTPError } from 'nitro'

interface CloudflareImagesEnv {
  CF_ACCOUNT_ID?: string
  CLOUDFLARE_IMAGES_API_TOKEN?: string
  CLOUDFLARE_IMAGES_VARIANT_BASE?: string
}

function accountId(env: CloudflareImagesEnv): string {
  return env.CF_ACCOUNT_ID || ''
}

/**
 * Only production holds the Images credentials, on purpose. Staging, preview,
 * local development and E2E run on copies of production's rows, and those rows
 * name production's images: an environment holding the token deleted
 * production's social cards whenever it regenerated its own. Without the
 * credentials those environments still show every image (delivery URLs are
 * public) but cannot store or delete one, and this says so rather than failing
 * somewhere further down.
 */
export function assertCloudflareImagesConfigured(env: CloudflareImagesEnv): void {
  if (accountId(env) && env.CLOUDFLARE_IMAGES_API_TOKEN && env.CLOUDFLARE_IMAGES_VARIANT_BASE) return
  throw new HTTPError({
    statusCode: 503,
    statusMessage: 'Cloudflare Images is not configured in this environment, by design',
    message: 'Cloudflare Images is not configured in this environment, by design. Only production holds the Images credentials: staging, preview, local development and E2E run on copies of production data, so storing or deleting an image from them would change production\'s images. Image uploads, social-card generation and image deletion run only in production; do not add the credentials here to make this pass.',
  })
}

interface CloudflareImagesResponse {
  result?: {
    id?: string
    uploadURL?: string
  }
}

function apiBase(env: CloudflareImagesEnv): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId(env)}/images`
}

function authHeader(env: CloudflareImagesEnv): Record<string, string> {
  return { Authorization: `Bearer ${env.CLOUDFLARE_IMAGES_API_TOKEN}` }
}

/** Request a one-time Direct Creator Upload URL. Client uploads directly to CF Images — no server buffering. */
export async function requestImageUpload(env: CloudflareImagesEnv): Promise<{ imageId: string; uploadUrl: string }> {
  assertCloudflareImagesConfigured(env)
  const formData = new FormData()
  const res = await fetch(`${apiBase(env)}/v2/direct_upload`, {
    method: 'POST',
    headers: authHeader(env),
    body: formData,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`CF Images direct_upload error ${res.status}: ${await res.text()}`)
  const data = await res.json() as CloudflareImagesResponse
  const imageId = typeof data?.result?.id === 'string' ? data.result.id : ''
  const uploadUrl = typeof data?.result?.uploadURL === 'string' ? data.result.uploadURL : ''
  if (!imageId || !uploadUrl) {
    throw new Error(`CF Images direct_upload malformed response ${res.status}: ${JSON.stringify(data)}`)
  }
  return { imageId, uploadUrl }
}

/** Upload an image buffer directly (for server-generated images). */
export async function uploadImageBuffer(
  env: CloudflareImagesEnv,
  buffer: ArrayBuffer | Uint8Array<ArrayBuffer>,
  filename: string,
  contentType = 'image/png'
): Promise<{ imageId: string; publicUrl: string; thumbnailUrl: string }> {
  assertCloudflareImagesConfigured(env)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: contentType }), filename)
  const signal = AbortSignal.timeout(30_000)

  let res: Response
  try {
    res = await fetch(`${apiBase(env)}/v1`, {
      method: 'POST',
      headers: authHeader(env),
      body: form,
      signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`CF Images upload request failed for account ${accountId(env) || 'missing'}: ${message}`, { cause: error })
  }
  if (!res.ok) {
    const body = await res.text()
    console.error(`[CF Images] upload error ${res.status}: ${body}`)
    throw new Error(`CF Images upload error ${res.status}: ${body}`)
  }
  const data = await res.json() as CloudflareImagesResponse
  const id = typeof data?.result?.id === 'string' ? data.result.id : ''
  if (!id) {
    throw new Error(`CF Images upload malformed response ${res.status}: ${JSON.stringify(data)}`)
  }
  return {
    imageId: id,
    publicUrl: buildImageUrl(env, id, 'public'),
    thumbnailUrl: buildImageUrl(env, id, 'thumbnail'),
  }
}

/** Delete an image from Cloudflare Images. */
export async function deleteImage(env: CloudflareImagesEnv, imageId: string): Promise<void> {
  assertCloudflareImagesConfigured(env)
  let res: Response
  try {
    res = await fetch(`${apiBase(env)}/v1/${imageId}`, {
      method: 'DELETE',
      headers: authHeader(env),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`CF Images delete request failed for ${imageId}: ${message}`, { cause: error })
  }

  if (!res.ok && res.status !== 404) {
    const details = await res.text()
    throw new Error(`CF Images delete error ${res.status}: ${details}`)
  }
}

/** Build a Cloudflare Images delivery URL for a given variant. */
/**
 * The stored filename of an image, from Cloudflare rather than from anything a
 * client sent. Null when the image is gone.
 */
export async function getImageFilename(env: CloudflareImagesEnv, imageId: string): Promise<string | null> {
  assertCloudflareImagesConfigured(env)
  const res = await fetch(`${apiBase(env)}/v1/${imageId}`, {
    headers: authHeader(env),
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`CF Images lookup error ${res.status}: ${await res.text()}`)
  const data = await res.json() as { result?: { filename?: string } }
  return typeof data?.result?.filename === 'string' ? data.result.filename : null
}

/**
 * Deletes an image only when Cloudflare says it carries the expected filename.
 *
 * Ownership is never inferred from a delivery URL. `user.image` is a plain
 * Better Auth field an authenticated client can set to any string, so a URL
 * there proves nothing — someone could point it at another person's image and
 * have us delete it with the account-wide token. The filename we set at upload
 * is server-trusted state, and this checks it.
 */
export async function deleteImageOwnedBy(env: CloudflareImagesEnv, imageId: string, expectedFilename: string): Promise<boolean> {
  const filename = await getImageFilename(env, imageId)
  if (filename !== expectedFilename) return false
  await deleteImage(env, imageId)
  return true
}

export function buildImageUrl(env: CloudflareImagesEnv, imageId: string, variant = 'public'): string {
  if (!env.CLOUDFLARE_IMAGES_VARIANT_BASE) {
    throw new Error('Cloudflare Images variant base not configured')
  }
  return `${env.CLOUDFLARE_IMAGES_VARIANT_BASE}/${imageId}/${variant}`
}
