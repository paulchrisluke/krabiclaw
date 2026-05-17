// POST /api/admin/ai/generate-image
// Generates an image via Flux (Cloudflare Workers AI), uploads to Cloudflare Images,
// creates a media_asset record for platform use (no site_id).
// body: { prompt }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { deleteImage, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'

const MODEL = '@cf/black-forest-labs/flux-1-schnell'
const IMAGE_GENERATION_TIMEOUT_MS = 20_000

interface AiImageResult {
  image?: string
}

interface TimedError extends Error {
  code?: string
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  const body = await readBody(event)
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 500) : ''
  if (!prompt) return jsonResponse({ error: 'prompt required' }, { status: 400 })

  const ai = env.AI
  if (!ai) return jsonResponse({ error: 'AI binding not configured' }, { status: 503 })

  if (!env.CLOUDFLARE_IMAGES_API_TOKEN) {
    return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
  }

  let imageId = ''
  let publicUrl = ''
  let thumbnailUrl = ''
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutError: TimedError = new Error(`Image generation timed out after ${IMAGE_GENERATION_TIMEOUT_MS}ms`)
        timeoutError.code = 'AI_TIMEOUT'
        reject(timeoutError)
      }, IMAGE_GENERATION_TIMEOUT_MS)
    })

    const result = await Promise.race([
      ai.run(MODEL, { prompt, num_steps: 4 }),
      timeoutPromise
    ]).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    })

    const aiResult = result as AiImageResult | null
    const imageBase64 = typeof aiResult?.image === 'string' ? aiResult.image.trim() : ''
    if (!imageBase64) {
      throw new Error('AI image generation returned an invalid response payload')
    }

    const buffer = Buffer.from(imageBase64, 'base64')
    const imageData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    const uploadResult = await uploadImageBuffer(env, imageData, `platform-generated-${Date.now()}.png`)
    if (!uploadResult?.imageId || !uploadResult?.publicUrl || !uploadResult?.thumbnailUrl) {
      throw new Error('Image upload returned incomplete asset URLs')
    }

    imageId = uploadResult.imageId
    publicUrl = uploadResult.publicUrl
    thumbnailUrl = uploadResult.thumbnailUrl
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const timedError = normalizedError as TimedError
    console.error('platform_generate_image_failed', {
      userId: session.user.id,
      model: MODEL,
      timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
      error: normalizedError.message,
      stack: normalizedError.stack || null
    })
    if (timedError.code === 'AI_TIMEOUT') {
      return jsonResponse({ error: 'Image generation timed out' }, { status: 504 })
    }
    return jsonResponse({ error: 'Failed to generate image' }, { status: 500 })
  }

  const assetId = crypto.randomUUID()
  try {
    // Platform owners may have organization/site IDs on their user object in this setup.
    const user = session.user as {
      organization_id?: string
      organizationId?: string
      site_id?: string
      siteId?: string
    }
    const organizationId = user.organization_id || user.organizationId
    const siteId = user.site_id || user.siteId

    if (!organizationId || !siteId) {
      console.error('generate_image_missing_context', { userId: session.user.id, organizationId, siteId })
      return jsonResponse({ error: 'User must have an active organization and site to generate assets' }, { status: 400 })
    }

    await createMediaAsset(db, {
      id: assetId,
      organization_id: organizationId,
      site_id: siteId,
      location_id: null,
      kind: 'image',
      provider: 'chowbot',
      source: 'generated',
      cloudflare_image_id: imageId,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      mime_type: 'image/png',
      status: 'active',
      created_by_user_id: session.user.id,
    })
  } catch (error) {
    try {
      if (imageId) await deleteImage(env, imageId)
    } catch (cleanupError) {
      const normalizedCleanupError = cleanupError instanceof Error ? cleanupError : new Error('Unknown cleanup error')
      console.error('platform_generate_image_cleanup_failed', {
        assetId,
        imageId,
        error: normalizedCleanupError.message
      })
    }

    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('platform_generate_image_create_media_asset_failed', {
      assetId,
      imageId,
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to save generated image' }, { status: 500 })
  }

  return jsonResponse({ id: assetId, publicUrl, thumbnailUrl, status: 'active' })
})
