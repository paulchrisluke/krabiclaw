// POST /api/mcp/media/:assetId/activate
// Called by the photo-upload widget after the file has been uploaded to Cloudflare Images.
// Auth: the assetId UUID (122-bit entropy) is the credential — only the MCP session that
// called request_photo_upload knows it. Requires site_id in body to double-bind the asset.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { buildImageUrl, hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { activateMediaAsset, getMediaAsset } from '~/server/utils/media-asset-manager'

export default defineEventHandler(async (event) => {
  const assetId = getRouterParam(event, 'assetId')
  if (!assetId) return jsonResponse({ error: 'Missing assetId' }, { status: 400 })

  const body = await readBody(event).catch(() => null)
  const siteId = typeof body?.site_id === 'string' ? body.site_id : null
  if (!siteId) return jsonResponse({ error: 'Missing site_id' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (!hasCloudflareImagesConfig(env)) return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })

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
