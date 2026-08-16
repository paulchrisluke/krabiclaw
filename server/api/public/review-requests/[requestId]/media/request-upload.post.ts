import { cleanString, cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { executeBatch, queryFirst } from '~/server/db'
import { deleteImage, hasCloudflareImagesConfig, requestImageUpload } from '~/server/utils/cloudflare-images'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId')
  if (!requestId) return jsonResponse({ error: 'requestId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readRequiredBody<ApiRecord>(event)
  const token = cleanString(body.token, 300)
  const kind = cleanString(body.kind, 20)
  const filename = cleanString(body.filename, 255)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })
  if (kind !== 'image') return jsonResponse({ error: 'Invalid media type' }, { status: 400 })
  if (!filename) return jsonResponse({ error: 'Filename required' }, { status: 400 })
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return jsonResponse({ error: 'Invalid filename' }, { status: 400 })
  }

  const result = await getReviewRequestByToken(db, token)
  if (!result || result.request.id !== requestId) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  if (result.request.user_id && result.request.user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  if (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  const existingCount = await queryFirst<{ count: number }>(db, `
    SELECT COUNT(*) AS count
    FROM review_media
    WHERE review_request_id = ? AND kind = 'image' AND status != 'deleted'
  `, [requestId])
  if (Number(existingCount?.count ?? 0) >= 5) return jsonResponse({ error: 'You can upload up to 5 photos.' }, { status: 400 })
  if (!hasCloudflareImagesConfig(env)) return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })

  const assetId = crypto.randomUUID()
  const mediaLinkId = crypto.randomUUID()
  let imageId = ''
  try {
    const upload = await requestImageUpload(env)
    imageId = upload.imageId
    const now = new Date().toISOString()
    await executeBatch(db, [
      {
        query: `
          INSERT INTO media_assets (
            id, organization_id, site_id, location_id, kind, provider, source, cloudflare_image_id, file_name, category, status, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'image', 'cloudflare_images', 'uploaded', ?, ?, 'other', 'pending', ?, ?, ?)
        `, params: [
          assetId, result.context.organization_id, result.context.site_id, result.context.location_id, imageId, filename, sessionUser.id, now, now, ], }, {
        query: `
          INSERT INTO review_media (
            id, review_request_id, customer_id, media_asset_id, kind, sort_order, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'image', ?, 'pending', ?, ?)
        `, params: [
          mediaLinkId, requestId, result.request.customer_id, assetId, Number(existingCount?.count ?? 0), now, now, ], }, {
        query: `
          UPDATE review_requests
          SET user_id = COALESCE(user_id, ?), anonymous_user_id = COALESCE(anonymous_user_id, ?), updated_at = ?
          WHERE id = ?
        `, params: [
          sessionUser.isAnonymous ? null : sessionUser.id, sessionUser.isAnonymous ? sessionUser.id : null, now, requestId, ], }, ])

    return jsonResponse({ assetId, mediaId: mediaLinkId, uploadUrl: upload.uploadUrl, imageId })
  } catch (error) {
    if (imageId) {
      try {
        await deleteImage(env, imageId)
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError], `Review image upload setup failed: ${error instanceof Error ? error.message : String(error)}; Cloudflare Images cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, )
      }
    }
    throw error
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
import { readBody } from 'nitro/h3';
