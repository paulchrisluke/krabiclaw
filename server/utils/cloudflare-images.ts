interface CloudflareImagesEnv {
  CF_ACCOUNT_ID?: string
  CLOUDFLARE_IMAGES_API_TOKEN?: string
  CLOUDFLARE_IMAGES_VARIANT_BASE?: string
}

export function hasCloudflareImagesConfig(env: CloudflareImagesEnv): boolean {
  return Boolean(env.CF_ACCOUNT_ID && env.CLOUDFLARE_IMAGES_API_TOKEN && env.CLOUDFLARE_IMAGES_VARIANT_BASE)
}

interface CloudflareImagesResponse {
  result?: {
    id?: string
    uploadURL?: string
  }
}

function apiBase(env: CloudflareImagesEnv): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images`
}

function authHeader(env: CloudflareImagesEnv): Record<string, string> {
  return { Authorization: `Bearer ${env.CLOUDFLARE_IMAGES_API_TOKEN}` }
}

/** Request a one-time Direct Creator Upload URL. Client uploads directly to CF Images — no server buffering. */
export async function requestImageUpload(env: CloudflareImagesEnv): Promise<{ imageId: string; uploadUrl: string }> {
  const formData = new FormData()
  const res = await fetch(`${apiBase(env)}/v2/direct_upload`, {
    method: 'POST',
    headers: authHeader(env),
    body: formData,
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
  buffer: ArrayBuffer,
  filename: string,
  contentType = 'image/png'
): Promise<{ imageId: string; publicUrl: string; thumbnailUrl: string }> {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: contentType }), filename)

  const res = await fetch(`${apiBase(env)}/v1`, {
    method: 'POST',
    headers: authHeader(env),
    body: form,
  })
  if (!res.ok) throw new Error(`CF Images upload error ${res.status}: ${await res.text()}`)
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
  let res: Response
  try {
    res = await fetch(`${apiBase(env)}/v1/${imageId}`, {
      method: 'DELETE',
      headers: authHeader(env),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`CF Images delete request failed for ${imageId}: ${message}`)
  }

  if (!res.ok) {
    const details = await res.text()
    throw new Error(`CF Images delete error ${res.status}: ${details}`)
  }
}

/** Build a Cloudflare Images delivery URL for a given variant. */
export function buildImageUrl(env: CloudflareImagesEnv, imageId: string, variant = 'public'): string {
  if (!env.CLOUDFLARE_IMAGES_VARIANT_BASE) {
    throw new Error('Cloudflare Images variant base not configured')
  }
  return `${env.CLOUDFLARE_IMAGES_VARIANT_BASE}/${imageId}/${variant}`
}
