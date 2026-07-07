import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { deleteImage, hasCloudflareImagesConfig, requestImageUpload } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId')
  if (!requestId) return jsonResponse({ error: 'requestId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as ApiRecord
  const token = cleanString(body.token, 300)
  const kind = cleanString(body.kind, 20) || 'image'
  const filename = cleanString(body.filename, 255) || 'review-image'
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })
  if (kind !== 'image' && kind !== 'video') return jsonResponse({ error: 'Invalid media type' }, { status: 400 })
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return jsonResponse({ error: 'Invalid filename' }, { status: 400 })
  }

  const result = await getReviewRequestByToken(db, token)
  if (!result || result.request.id !== requestId) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  if (result.request.user_id && result.request.user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  if (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  if (kind === 'video') {
    const existingVideos = await queryFirst<{ count: number }>(db, `
      SELECT COUNT(*) AS count
      FROM review_media
      WHERE review_request_id = ? AND kind = 'video' AND status != 'deleted'
    `, [requestId])
    if (Number(existingVideos?.count ?? 0) >= 2) return jsonResponse({ error: 'You can upload up to 2 videos.' }, { status: 400 })
    return jsonResponse({
      kind: 'video',
      direct: false,
      uploadUrl: `/api/public/review-requests/${encodeURIComponent(requestId)}/media/upload`,
      maxBytes: 250 * 1024 * 1024,
    })
  }

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
    await createMediaAsset(db, {
      id: assetId,
      organization_id: result.context.organization_id,
      site_id: result.context.site_id,
      location_id: result.context.location_id,
      kind: 'image',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflare_image_id: imageId,
      status: 'pending',
      file_name: filename,
      category: 'other',
      created_by_user_id: sessionUser.id,
    })
    await execute(db, `
      INSERT INTO review_media (id, review_request_id, customer_id, media_asset_id, kind, sort_order, status)
      VALUES (?, ?, ?, ?, 'image', ?, 'pending')
    `, [mediaLinkId, requestId, result.request.customer_id, assetId, Number(existingCount?.count ?? 0)])
    await execute(db, `
      UPDATE review_requests
      SET user_id = COALESCE(user_id, ?),
          anonymous_user_id = COALESCE(anonymous_user_id, ?),
          updated_at = ?
      WHERE id = ?
    `, [sessionUser.isAnonymous ? null : sessionUser.id, sessionUser.isAnonymous ? sessionUser.id : null, new Date().toISOString(), requestId])

    return jsonResponse({ assetId, mediaId: mediaLinkId, uploadUrl: upload.uploadUrl, imageId })
  } catch (error) {
    if (imageId) await deleteImage(env, imageId).catch(() => undefined)
    throw error
  }
})
