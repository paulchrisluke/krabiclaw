// POST /api/admin/platform/media - Upload a platform (non-tenant) media asset
// Mirrors the upload_platform_image MCP tool (server/utils/platform-mcp-executor.ts)
// for admin contexts that need this outside a ChatGPT/MCP session, e.g. docs screenshots.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { hasCloudflareImagesConfig, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { ensurePlatformMediaScope, listPlatformMediaAssets, PLATFORM_MEDIA_ORG_ID, PLATFORM_MEDIA_SITE_ID } from '~/server/utils/platform-media'

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_BYTES = 10 * 1024 * 1024

function sanitizeFilename(raw: string | undefined): string {
  const sanitized = (raw ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'upload'
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['media'] })
  if (permissionDenied) return permissionDenied

  if (!hasCloudflareImagesConfig(env)) {
    return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
  }

  // Check Content-Length before parsing multipart to avoid memory exhaustion
  const contentLengthHeader = getHeader(event, 'content-length')
  if (!contentLengthHeader) {
    return jsonResponse({ error: 'Content-Length header required' }, { status: 413 })
  }
  const contentLength = Number(contentLengthHeader)
  if (isNaN(contentLength) || contentLength < 0) {
    return jsonResponse({ error: 'Invalid Content-Length header' }, { status: 413 })
  }
  if (contentLength > MAX_BYTES) {
    return jsonResponse({ error: 'Request body too large (max 10 MB)' }, { status: 413 })
  }

  const formData = await readMultipartFormData(event)
  if (!formData) return jsonResponse({ error: 'Multipart form data required' }, { status: 400 })

  const filePart = formData.find(p => p.name === 'file')
  if (!filePart?.data) return jsonResponse({ error: 'file field required' }, { status: 400 })

  const contentType = typeof filePart.type === 'string'
    ? filePart.type.split(';', 1)[0]?.toLowerCase().trim() || ''
    : ''
  if (!IMAGE_MIME_TYPES.has(contentType)) {
    return jsonResponse({ error: `Unsupported file type: ${contentType || 'unknown'}` }, { status: 415 })
  }
  if (filePart.data.byteLength > MAX_BYTES) {
    return jsonResponse({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  const filename = sanitizeFilename(filePart.filename)
  const altTextPart = formData.find(p => p.name === 'alt_text')
  const altText = altTextPart?.data ? Buffer.from(altTextPart.data).toString().trim() || null : null

  let uploaded: { imageId: string; publicUrl: string; thumbnailUrl: string } | null = null
  try {
    // Extract exact byte range as ArrayBuffer to avoid uploading full backing buffer
    const arrayBuffer = new ArrayBuffer(filePart.data.byteLength)
    new Uint8Array(arrayBuffer).set(new Uint8Array(filePart.data.buffer, filePart.data.byteOffset, filePart.data.byteLength))
    uploaded = await uploadImageBuffer(env, arrayBuffer as ArrayBuffer, filename, contentType)

    await ensurePlatformMediaScope(db)
    const assetId = crypto.randomUUID()
    await createMediaAsset(db, {
      id: assetId,
      organization_id: PLATFORM_MEDIA_ORG_ID,
      site_id: PLATFORM_MEDIA_SITE_ID,
      kind: 'image',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflare_image_id: uploaded.imageId,
      public_url: uploaded.publicUrl,
      thumbnail_url: uploaded.thumbnailUrl,
      alt_text: altText,
      mime_type: contentType,
      file_name: filename,
      status: 'active',
      created_by_user_id: session.user.id,
    })

    const asset = (await listPlatformMediaAssets(db, { id: assetId, limit: 1 }))[0] ?? null
    if (!asset) return jsonResponse({ error: 'Uploaded media asset was not found after creation' }, { status: 500 })
    return jsonResponse({ asset })
  } catch (err) {
    // Clean up orphaned Cloudflare image if upload succeeded but DB insert failed
    if (uploaded?.imageId) {
      try {
        await env.CF_IMAGES.delete(uploaded.imageId)
      } catch (cleanupErr) {
        console.error('Failed to clean up orphaned Cloudflare image:', cleanupErr)
      }
    }
    console.error('Failed to upload platform media:', err)
    return jsonResponse({ error: 'Failed to upload media' }, { status: 500 })
  }
})
