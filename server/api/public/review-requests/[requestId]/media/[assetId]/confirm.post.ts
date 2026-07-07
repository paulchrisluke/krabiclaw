import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { buildImageUrl, hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { activateMediaAsset, getMediaAsset } from '~/server/utils/media-asset-manager'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId')
  const assetId = getRouterParam(event, 'assetId')
  if (!requestId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as ApiRecord
  const token = cleanString(body.token, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token)
  if (!result || result.request.id !== requestId) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  if (result.request.user_id && result.request.user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  if (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  const link = await queryFirst<{ id: string }>(db, `
    SELECT id
    FROM review_media
    WHERE review_request_id = ? AND media_asset_id = ? AND customer_id = ? AND status = 'pending'
    LIMIT 1
  `, [requestId, assetId, result.request.customer_id])
  if (!link) return jsonResponse({ error: 'Review media not found' }, { status: 404 })

  const asset = await getMediaAsset(db, assetId, result.context.site_id)
  if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
  if (asset.status !== 'pending') return jsonResponse({ error: 'Asset already confirmed' }, { status: 409 })
  if (!asset.cloudflare_image_id) return jsonResponse({ error: 'Asset has no Cloudflare image ID' }, { status: 422 })
  if (!hasCloudflareImagesConfig(env)) return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })

  const publicUrl = buildImageUrl(env, asset.cloudflare_image_id, 'public')
  const thumbnailUrl = buildImageUrl(env, asset.cloudflare_image_id, 'thumbnail')
  const activated = await activateMediaAsset(db, assetId, result.context.site_id, { public_url: publicUrl, thumbnail_url: thumbnailUrl })
  if (!activated) return jsonResponse({ error: 'Asset already confirmed' }, { status: 409 })

  return jsonResponse({ id: assetId, publicUrl, thumbnailUrl, status: 'pending' })
})
