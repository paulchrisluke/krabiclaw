// POST /api/mcp/media/:assetId/activate
// Called by the photo-upload widget after the file has been uploaded to Cloudflare Images.
// Auth: requires a signed activation token containing asset_id, site_id, and expiration.
// The token is generated when requesting the upload and must be verified here.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { buildImageUrl, hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { activateMediaAsset, getMediaAsset } from '~/server/utils/media-asset-manager'
import { verifyMediaActivationToken } from '~/server/utils/media-activation-token'

export default defineEventHandler(async (event) => {
  const assetId = getRouterParam(event, 'assetId')
  if (!assetId) return jsonResponse({ error: 'Missing assetId' }, { status: 400 })

  const body = await readBody(event).catch(() => null)
  const siteId = typeof body?.site_id === 'string' ? body.site_id : null
  if (!siteId) return jsonResponse({ error: 'Missing site_id' }, { status: 400 })

  const activationToken = typeof body?.activation_token === 'string' ? body.activation_token : null
  if (!activationToken) return jsonResponse({ error: 'Missing activation_token' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (!hasCloudflareImagesConfig(env)) return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })

  const activationSecret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : ''
  if (!activationSecret) return jsonResponse({ error: 'Activation secret not configured' }, { status: 500 })

  const tokenValid = await verifyMediaActivationToken(activationSecret, assetId, siteId, activationToken)
  if (!tokenValid) return jsonResponse({ error: 'Invalid or expired activation token' }, { status: 401 })

  const asset = await getMediaAsset(db, assetId, siteId)
  if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
  if (!asset.cloudflare_image_id) return jsonResponse({ error: 'Asset has no image ID' }, { status: 422 })

  if (asset.status === 'active') {
    const publicUrl = buildImageUrl(env, asset.cloudflare_image_id, 'public')
    const thumbnailUrl = buildImageUrl(env, asset.cloudflare_image_id, 'thumbnail')
    return jsonResponse({ assetId, publicUrl, thumbnailUrl, status: 'active' })
  }
  if (asset.status !== 'pending') {
    return jsonResponse({ error: 'Asset cannot be activated' }, { status: 409 })
  }

  const publicUrl = buildImageUrl(env, asset.cloudflare_image_id, 'public')
  const thumbnailUrl = buildImageUrl(env, asset.cloudflare_image_id, 'thumbnail')

  await activateMediaAsset(db, assetId, siteId, { public_url: publicUrl, thumbnail_url: thumbnailUrl })

  return jsonResponse({ assetId, publicUrl, thumbnailUrl, status: 'active' })
})
