import { REVIEW_VIDEO_MAX_BYTES, REVIEW_VIDEO_MAX_LABEL } from '~/config/media-limits'
import { cleanString, cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { executeBatch, queryFirst } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { buildMediaPlacementInsertQuery, deleteMediaAsset } from '~/server/utils/media-asset-manager'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { sniffMediaMimeType, VIDEO_MIME_TYPES, POSTER_IMAGE_MIME_TYPES, MAX_POSTER_BYTES } from '~/server/utils/media-mime'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

const MULTIPART_OVERHEAD_BYTES = 64 * 1024

function sanitizeFilename(raw: string): string {
  const sanitized = raw
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'review-video'
}

export default defineHandler(async (event) => {
  try {
    const requestId = getRouterParam(event, 'requestId')
    if (!requestId) return jsonResponse({ error: 'requestId required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
    if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const token = cleanString(event.req.headers.get('x-review-token'), 300)
    if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

    const result = await getReviewRequestByToken(db, token)
    if (!result || result.request.id !== requestId) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
    if (result.request.user_id && result.request.user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
    if (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const existingMedia = await queryFirst<{ count: number; next_sort_order: number }>(db, `
      SELECT
        COUNT(CASE WHEN ma.kind = 'video' AND mp.status != 'rejected' THEN 1 END) AS count,
        COALESCE(MAX(mp.sort_order) + 1, 0) AS next_sort_order
      FROM media_placements mp
      JOIN media_assets ma ON ma.id = mp.asset_id
      WHERE mp.owner_type = 'review_request' AND mp.owner_id = ?
    `, [requestId])
    if (Number(existingMedia?.count ?? 0) >= 2) return jsonResponse({ error: 'You can upload up to 2 videos.' }, { status: 400 })

    const contentLengthHeader = event.req.headers.get('content-length')
    const contentLength = contentLengthHeader && /^\d+$/.test(contentLengthHeader)
      ? Number(contentLengthHeader)
      : contentLengthHeader ? Number.NaN : null
    if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength <= 0)) {
      return jsonResponse({ error: 'Invalid Content-Length header' }, { status: 400 })
    }
    if (contentLength !== null && contentLength > REVIEW_VIDEO_MAX_BYTES + MAX_POSTER_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return jsonResponse({ error: `Videos must be ${REVIEW_VIDEO_MAX_LABEL} or smaller.` }, { status: 413 })
    }

    const formData = await event.req.formData()
    const videoPart = formData.get('video')
    const thumbnailPart = formData.get('thumbnail')
    if (!(videoPart instanceof File) || !(thumbnailPart instanceof File)) return jsonResponse({ error: 'video and thumbnail fields are required' }, { status: 400 })
    if (videoPart.size > REVIEW_VIDEO_MAX_BYTES) {
      return jsonResponse({ error: `Videos must be ${REVIEW_VIDEO_MAX_LABEL} or smaller.` }, { status: 413 })
    }
    if (thumbnailPart.size > MAX_POSTER_BYTES) return jsonResponse({ error: 'Thumbnail image too large (max 10 MB)' }, { status: 413 })

    const [videoData, thumbnailData] = await Promise.all([
      videoPart.arrayBuffer().then(buffer => new Uint8Array(buffer)),
      thumbnailPart.arrayBuffer().then(buffer => new Uint8Array(buffer)),
    ])
    const videoContentType = sniffMediaMimeType(videoData)
    if (!VIDEO_MIME_TYPES.has(videoContentType)) {
      return jsonResponse({ error: 'Accepted video formats are MP4 and WebM. .mov files are not supported.' }, { status: 415 })
    }
    const thumbnailContentType = sniffMediaMimeType(thumbnailData)
    if (!POSTER_IMAGE_MIME_TYPES.has(thumbnailContentType)) return jsonResponse({ error: 'Unsupported thumbnail image type' }, { status: 415 })
    const filename = sanitizeFilename(videoPart.name || 'review-video')

    const mediaLinkId = crypto.randomUUID()
    const uploaded = await uploadResolvedMediaToAssetStore({
      db,
      env,
      siteId: result.context.site_id,
      organizationId: result.context.organization_id,
      userId: sessionUser.id,
      buffer: videoData,
      contentType: videoContentType,
      filename,
      kind: 'video',
      source: 'uploaded',
      category: 'other',
      fileSize: videoData.byteLength,
      poster: {
        buffer: thumbnailData,
        contentType: thumbnailContentType,
        filename: sanitizeFilename(thumbnailPart.name || `${filename}-thumbnail.jpg`),
      },
    })
    try {
      const now = new Date().toISOString()
      await executeBatch(db, [
        buildMediaPlacementInsertQuery({
          id: mediaLinkId,
          organizationId: result.context.organization_id,
          siteId: result.context.site_id,
          ownerType: 'review_request',
          ownerId: requestId,
          slot: 'gallery',
          assetId: uploaded.assetId,
          sortOrder: Number(existingMedia?.next_sort_order ?? 0),
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        }), {
          query: `
            UPDATE review_requests
            SET user_id = COALESCE(user_id, ?), anonymous_user_id = COALESCE(anonymous_user_id, ?), updated_at = ?
            WHERE id = ?
          `, params: [
            sessionUser.isAnonymous ? null : sessionUser.id, sessionUser.isAnonymous ? sessionUser.id : null, now, requestId, ], }, ])
    } catch (linkError) {
      try {
        await deleteMediaAsset(db, env, uploaded.assetId, result.context.site_id, sessionUser.id)
      } catch (cleanupError) {
        throw new AggregateError([linkError, cleanupError], 'Review video could not be linked or cleaned up')
      }
      throw linkError
    }

    return jsonResponse({
      asset_id: uploaded.assetId,
      public_url: uploaded.publicUrl,
      thumbnail_url: uploaded.thumbnailUrl,
      kind: 'video',
      status: 'active',
    }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown review video upload error')
    console.error('review_video_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({
      error: normalizedError instanceof AggregateError ? normalizedError.message : 'Failed to upload review video', message: normalizedError.message, }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
