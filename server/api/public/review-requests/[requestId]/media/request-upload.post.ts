import { cleanString, cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { executeBatch, queryFirst } from '~/server/db'
import { deleteImage, hasCloudflareImagesConfig, requestImageUpload } from '~/server/utils/cloudflare-images'
import { buildMediaAssetInsertQuery, buildMediaPlacementInsertQuery } from '~/server/utils/media-asset-manager'
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

  const existingMedia = await queryFirst<{ count: number; next_sort_order: number }>(db, `
    SELECT
      COUNT(CASE WHEN ma.kind = 'image' AND mp.status != 'rejected' THEN 1 END) AS count,
      COALESCE(MAX(mp.sort_order) + 1, 0) AS next_sort_order
    FROM media_placements mp
    JOIN media_assets ma ON ma.id = mp.asset_id
    WHERE mp.owner_type = 'review_request' AND mp.owner_id = ? AND mp.slot = 'gallery'
  `, [requestId])
  if (Number(existingMedia?.count ?? 0) >= 5) return jsonResponse({ error: 'You can upload up to 5 photos.' }, { status: 400 })
  if (!hasCloudflareImagesConfig(env)) return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })

  const assetId = crypto.randomUUID()
  const mediaLinkId = crypto.randomUUID()
  let imageId = ''
  try {
    const upload = await requestImageUpload(env)
    imageId = upload.imageId
    const now = new Date().toISOString()
    await executeBatch(db, [
      buildMediaAssetInsertQuery({
        id: assetId,
        organization_id: result.context.organization_id,
        site_id: result.context.site_id,
        kind: 'image',
        provider: 'cloudflare_images',
        source: 'uploaded',
        cloudflare_image_id: imageId,
        file_name: filename,
        category: 'other',
        status: 'pending',
        created_by_user_id: sessionUser.id,
      }, now),
      buildMediaPlacementInsertQuery({
        id: mediaLinkId,
        organizationId: result.context.organization_id,
        siteId: result.context.site_id,
        ownerType: 'review_request',
        ownerId: requestId,
        slot: 'gallery',
        assetId,
        sortOrder: Number(existingMedia?.next_sort_order ?? 0),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }),
      {
        query: `
          UPDATE review_requests
          SET user_id = COALESCE(user_id, ?), anonymous_user_id = COALESCE(anonymous_user_id, ?), updated_at = ?
          WHERE id = ?
        `, params: [
          sessionUser.isAnonymous ? null : sessionUser.id, sessionUser.isAnonymous ? sessionUser.id : null, now, requestId, ], }, ])

    return jsonResponse({ asset_id: assetId, upload_url: upload.uploadUrl, provider_id: imageId })
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
