// POST /api/ai/[siteId]/generate-image
// Generates an image via Flux (Cloudflare Workers AI), uploads to Cloudflare Images,
// creates a media_asset record, and charges 20 AI credits.
// body: { prompt, locationId? }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { deleteImage, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'

const MODEL = '@cf/black-forest-labs/flux-1-schnell'
const IMAGE_GENERATION_OUTPUT_TOKENS = 4000 // yields ~20 credits
const IMAGE_GENERATION_TIMEOUT_MS = 20_000

interface AiImageResult {
  image?: string
}

interface TimedError extends Error {
  code?: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.organization_id FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `).bind(siteId, session.user.id).first<{ organization_id: string }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const orgId: string = site.organization_id
  const isDev = process.env.NODE_ENV === 'development'

  if (!isDev) {
    const creditOk = await hasCredits(db, orgId)
    if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })
  }

  const body = await readBody(event)
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 500) : ''
  const locationId = typeof body?.locationId === 'string' ? body.locationId : null
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
    const uploadResult = await uploadImageBuffer(env, imageData, `generated-${Date.now()}.png`)
    if (!uploadResult?.imageId || !uploadResult?.publicUrl || !uploadResult?.thumbnailUrl) {
      throw new Error('Image upload returned incomplete asset URLs')
    }

    imageId = uploadResult.imageId
    publicUrl = uploadResult.publicUrl
    thumbnailUrl = uploadResult.thumbnailUrl
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const timedError = normalizedError as TimedError
    console.error('generate_image_failed', {
      siteId,
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
    await createMediaAsset(db, {
      id: assetId,
      organization_id: orgId,
      site_id: siteId,
      location_id: locationId,
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
      console.error('generate_image_cleanup_failed', {
        assetId,
        imageId,
        error: normalizedCleanupError.message
      })
    }

    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('generate_image_create_media_asset_failed', {
      assetId,
      imageId,
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to save generated image' }, { status: 500 })
  }

  if (!isDev) {
    const cfCtx = event.context.cloudflare?.context
    const charge = chargeCredits(db, orgId, {
      siteId, action: 'generate_image', model: MODEL,
      inputTokens: 0, outputTokens: IMAGE_GENERATION_OUTPUT_TOKENS,
    }).catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error('Unknown error')
      console.error('chargeCredits_failed', {
        siteId,
        model: MODEL,
        outputTokens: IMAGE_GENERATION_OUTPUT_TOKENS,
        error: normalizedError.message
      })
    })
    if (cfCtx?.waitUntil) {
      cfCtx.waitUntil(charge)
    } else {
      await charge
    }
  }

  return jsonResponse({ id: assetId, publicUrl, thumbnailUrl, status: 'active' })
})
