// POST /api/admin/ai/generate-image
// Generates an image via the configured OpenAI image model through CF AI Gateway, uploads to Cloudflare Images,
// creates a media_asset record for platform use (no site_id, no credit charge).
// body: { prompt }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { deleteImage, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { generateImageViaGateway, IMAGE_MODEL } from '~/server/utils/ai-gateway'

const PLATFORM_MEDIA_ORG_ID = 'platform'
const PLATFORM_MEDIA_SITE_ID = 'platform'

async function ensurePlatformMediaScope(db: D1Database): Promise<void> {
  const now = new Date().toISOString()
  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO organization (id, name, slug, createdAt)
      VALUES (?, ?, ?, ?)
    `).bind(PLATFORM_MEDIA_ORG_ID, 'KrabiClaw Platform', PLATFORM_MEDIA_ORG_ID, now),
    db.prepare(`
      INSERT OR IGNORE INTO sites (id, organization_id, theme_id, theme, slug, status, onboarding_status, created_at, updated_at)
      VALUES (?, ?, 'saya-theme-v1', 'saya', ?, 'active', 'active', ?, ?)
    `).bind(PLATFORM_MEDIA_SITE_ID, PLATFORM_MEDIA_ORG_ID, PLATFORM_MEDIA_SITE_ID, now, now),
  ])
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  const body = await readBody(event)
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 1000) : ''
  if (!prompt) return jsonResponse({ error: 'prompt required' }, { status: 400 })

  if (!env.CLOUDFLARE_IMAGES_API_TOKEN) {
    return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
  }

  let imageId = ''
  let publicUrl = ''
  let thumbnailUrl = ''

  try {
    const result = await generateImageViaGateway(env, prompt)
    const image = result.images[0]
    if (!image) throw new Error('Image generation returned no images')

    const uploadResult = await uploadImageBuffer(env, image.imageBuffer, image.filename || `platform-generated-${Date.now()}.png`)
    if (!uploadResult?.imageId || !uploadResult?.publicUrl || !uploadResult?.thumbnailUrl) {
      throw new Error('Image upload returned incomplete asset URLs')
    }

    imageId = uploadResult.imageId
    publicUrl = uploadResult.publicUrl
    thumbnailUrl = uploadResult.thumbnailUrl
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const code = (normalizedError as { code?: string }).code
    console.error('platform_generate_image_failed', {
      userId: session.user.id, model: IMAGE_MODEL,
      error: normalizedError.message, stack: normalizedError.stack ?? null
    })
    if (code === 'AI_TIMEOUT') {
      return jsonResponse({ error: 'Image generation timed out' }, { status: 504 })
    }
    return jsonResponse({ error: 'Failed to generate image' }, { status: 500 })
  }

  const assetId = crypto.randomUUID()
  try {
    await ensurePlatformMediaScope(db)
    await createMediaAsset(db, {
      id: assetId,
      organization_id: PLATFORM_MEDIA_ORG_ID,
      site_id: PLATFORM_MEDIA_SITE_ID,
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
      const e = cleanupError instanceof Error ? cleanupError : new Error('Unknown cleanup error')
      console.error('platform_generate_image_cleanup_failed', { assetId, imageId, error: e.message })
    }
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('platform_generate_image_create_media_asset_failed', { assetId, imageId, error: normalizedError.message })
    return jsonResponse({ error: 'Failed to save generated image' }, { status: 500 })
  }

  return jsonResponse({ id: assetId, publicUrl, thumbnailUrl, status: 'active' })
})
