import { cleanString, cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { executeBatch, queryFirst } from '~/server/db'
import { buildImageUrl, hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { getMediaAsset } from '~/server/utils/media-asset-manager'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId')
  const assetId = getRouterParam(event, 'assetId')
  if (!requestId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readRequiredBody<ApiRecord>(event)
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
  const eventId = crypto.randomUUID()
  const now = new Date().toISOString()
  const [, activation] = await executeBatch(db, [
    {
      query: `
        INSERT INTO site_events (
          id, organization_id, site_id, location_id, actor_id, event_type, entity_type, entity_id, metadata, created_at
        )
        SELECT ?, ?, ?, ?, ?, 'media.uploaded', 'media_asset', ?, ?, ?
        FROM media_assets
        WHERE id = ? AND site_id = ? AND status = 'pending'
      `, params: [
        eventId, result.context.organization_id, result.context.site_id, result.context.location_id, sessionUser.id, assetId, JSON.stringify({ kind: 'image', provider: 'cloudflare_images', source: 'uploaded', status: 'active' }), now, assetId, result.context.site_id, ], }, {
      query: `
        UPDATE media_assets
        SET status = 'active', public_url = ?, thumbnail_url = ?, updated_at = ?
        WHERE id = ? AND site_id = ? AND status = 'pending'
      `, params: [publicUrl, thumbnailUrl, now, assetId, result.context.site_id], }, ])
  if (Number(activation?.meta?.changes ?? 0) !== 1) return jsonResponse({ error: 'Asset already confirmed' }, { status: 409 })

  return jsonResponse({ id: assetId, publicUrl, thumbnailUrl, status: 'pending' })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
import { readBody } from 'nitro/h3';
