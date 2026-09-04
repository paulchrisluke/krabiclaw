// POST /api/ai/[siteId]/generate-image
// Generates an image via the configured OpenAI image model through CF AI Gateway, uploads to Cloudflare Images,
// creates a media_asset record, and charges credits from returned token usage.
// body: { prompt, resource_location_id? }
import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { deleteImage, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { createMediaAsset, deleteMediaAsset } from '~/server/utils/media-asset-manager'
import { generateImageViaGateway, IMAGE_MODEL } from '~/server/utils/ai-gateway'
import { assertResourceAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId, 'context')

  const orgId: string = site.organization_id
  const isDev = import.meta.dev

  if (!isDev) {
    const creditOk = await hasCredits(db, orgId, session.session.id)
    if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })
  }

  const body = await readRequiredBody<{ prompt?: unknown; resource_location_id?: unknown }>(event)
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 1000) : ''
  const resourceLocationId = typeof body?.resource_location_id === 'string' ? body.resource_location_id.trim() || null : null
  if (!prompt) return jsonResponse({ error: 'prompt required' }, { status: 400 })

  if (resourceLocationId) {
    const location = await queryFirst(db, 'SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1', [resourceLocationId, siteId]
    )
    if (!location) {
      return jsonResponse({ error: 'Invalid location ID' }, { status: 400 })
    }
  }

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId, })

  if (!env.CLOUDFLARE_IMAGES_API_TOKEN) {
    return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
  }

  let imageId: string
  let publicUrl: string
  let thumbnailUrl: string
  let generatedImage: Awaited<ReturnType<typeof generateImageViaGateway>>

  try {
    const result = await generateImageViaGateway(env, prompt)
    generatedImage = result
    const image = result.images[0]
    if (!image) throw new Error('Image generation returned no images')

    const uploadResult = await uploadImageBuffer(env, image.imageBuffer, image.filename || `generated-${Date.now()}.png`)
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
      siteId, userId: session.user.id, model: IMAGE_MODEL, error: normalizedError.message, stack: normalizedError.stack ?? null
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
      id: assetId, organization_id: orgId, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'generated', cloudflare_image_id: imageId, public_url: publicUrl, thumbnail_url: thumbnailUrl, mime_type: 'image/png', status: 'active', created_by_user_id: session.user.id, })
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
    try {
      await chargeCredits(db, orgId, {
        siteId, sessionId: session.session.id, action: 'generate_image', model: IMAGE_MODEL, inputTokens: generatedImage.inputTokens, outputTokens: generatedImage.outputTokens, cfGatewayLogId: generatedImage.cfLogId, })
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown error')
      console.error('chargeCredits_failed', { siteId, model: IMAGE_MODEL, error: normalizedError.message })
      await deleteMediaAsset(db, env, assetId, siteId, session.user.id).catch((cleanupError) => {
        console.error('generate_image_charge_cleanup_failed', { assetId, error: cleanupError })
      })
      return jsonResponse({ error: normalizedError.message.includes('quota') ? normalizedError.message : 'Image generation could not be charged.' }, { status: 402 })
    }
  }

  return jsonResponse({ asset_id: assetId, public_url: publicUrl, thumbnail_url: thumbnailUrl, status: 'active' })
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
