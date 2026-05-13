function apiBase(env: Record<string, any>): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images`
}

function authHeader(env: Record<string, any>): Record<string, string> {
  return { Authorization: `Bearer ${env.CLOUDFLARE_IMAGES_API_TOKEN}` }
}

/** Request a one-time Direct Creator Upload URL. Client uploads directly to CF Images — no server buffering. */
export async function requestImageUpload(env: Record<string, any>): Promise<{ imageId: string; uploadUrl: string }> {
  const res = await fetch(`${apiBase(env)}/v2/direct_upload`, {
    method: 'POST',
    headers: { ...authHeader(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`CF Images direct_upload error ${res.status}: ${await res.text()}`)
  const data = await res.json() as any
  const imageId = typeof data?.result?.id === 'string' ? data.result.id : ''
  const uploadUrl = typeof data?.result?.uploadURL === 'string' ? data.result.uploadURL : ''
  if (!imageId || !uploadUrl) {
    throw new Error(`CF Images direct_upload malformed response ${res.status}: ${JSON.stringify(data)}`)
  }
  return { imageId, uploadUrl }
}

/** Upload an image buffer directly (for server-generated images). */
export async function uploadImageBuffer(
  env: Record<string, any>,
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
  const data = await res.json() as any
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
export async function deleteImage(env: Record<string, any>, imageId: string): Promise<void> {
  try {
    const res = await fetch(`${apiBase(env)}/v1/${imageId}`, {
      method: 'DELETE',
      headers: authHeader(env),
    })
    if (!res.ok) {
      const details = await res.text()
      throw new Error(`CF Images delete error ${res.status}: ${details}`)
    }
  } catch (error: any) {
    throw new Error(`CF Images delete request failed for ${imageId}: ${error?.message || 'Unknown error'}`)
  }
}

/** Build a Cloudflare Images delivery URL for a given variant. */
export function buildImageUrl(env: Record<string, any>, imageId: string, variant = 'public'): string {
  return `${env.CLOUDFLARE_IMAGES_VARIANT_BASE}/${imageId}/${variant}`
}
