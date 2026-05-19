// POST /api/ai/[siteId]/generate-image
// Generates an image via DALL-E 3 through CF AI Gateway, uploads to Cloudflare Images,
// creates a media_asset record, and charges 50 AI credits.
// body: { prompt, locationId? }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { deleteImage, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { generateImageViaGateway, IMAGE_MODEL } from '~/server/utils/ai-gateway'

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
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 1000) : ''
  const locationId = typeof body?.locationId === 'string' ? body.locationId : null
  if (!prompt) return jsonResponse({ error: 'prompt required' }, { status: 400 })

  if (!env.CLOUDFLARE_IMAGES_API_TOKEN) {
    return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
  }

  let imageId = ''
  let publicUrl = ''
  let thumbnailUrl = ''
  let cfLogId: string | null = null
  let generatedImage = { inputTokens: 0, outputTokens: 0 }

  try {
    const result = await generateImageViaGateway(env, prompt)
    cfLogId = result.cfLogId
    generatedImage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens }

    const uploadResult = await uploadImageBuffer(env, result.imageBuffer, `generated-${Date.now()}.png`)
    if (!uploadResult?.imageId || !uploadResult?.publicUrl || !uploadResult?.thumbnailUrl) {
      throw new Error('Image upload returned incomplete asset URLs')
    }

    imageId = uploadResult.imageId
    publicUrl = uploadResult.publicUrl
    thumbnailUrl = uploadResult.thumbnailUrl
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const code = (normalizedError as { code?: string }).code
    console.error('generate_image_failed', {
      siteId, userId: session.user.id, model: IMAGE_MODEL,
      error: normalizedError.message, stack: normalizedError.stack ?? null
    })
    if (code === 'AI_TIMEOUT') {
      return jsonResponse({ error: 'Image generation timed out. Please try again.' }, { status: 504 })
    }
    if (normalizedError.message.includes('billing_hard_limit_reached') || normalizedError.message.includes('billing_limit')) {
      return jsonResponse({ error: 'Image generation is temporarily unavailable. Please try again later.' }, { status: 503 })
    }
    const message = isDev ? `Failed to generate image: ${normalizedError.message}` : 'Failed to generate image'
    return jsonResponse({ error: message }, { status: 500 })
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
      const e = cleanupError instanceof Error ? cleanupError : new Error('Unknown cleanup error')
      console.error('generate_image_cleanup_failed', { assetId, imageId, error: e.message })
    }
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('generate_image_create_media_asset_failed', { assetId, imageId, error: normalizedError.message })
    return jsonResponse({ error: 'Failed to save generated image' }, { status: 500 })
  }

  if (!isDev) {
    const cfCtx = event.context.cloudflare?.context
    const charge = chargeCredits(db, orgId, {
      siteId, action: 'generate_image', model: IMAGE_MODEL,
      inputTokens: generatedImage.inputTokens,
      outputTokens: generatedImage.outputTokens,
      cfGatewayLogId: cfLogId,
    }).catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error('Unknown error')
      console.error('chargeCredits_failed', { siteId, model: IMAGE_MODEL, error: normalizedError.message })
    })
    if (cfCtx?.waitUntil) {
      cfCtx.waitUntil(charge)
    } else {
      await charge
    }
  }

  return jsonResponse({ id: assetId, publicUrl, thumbnailUrl, status: 'active' })
})
