import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute, queryFirst } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { sniffMediaMimeType } from '~/server/utils/media-mime'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

const REVIEW_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const REVIEW_VIDEO_MAX_BYTES = 250 * 1024 * 1024

function sanitizeFilename(raw: string | undefined): string {
  const sanitized = (raw ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'review-video'
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.slice().buffer
}

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId')
  if (!requestId) return jsonResponse({ error: 'requestId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const formData = await readMultipartFormData(event)
  if (!formData) return jsonResponse({ error: 'Multipart form data required' }, { status: 400 })

  const tokenPart = formData.find(part => part.name === 'token')
  const token = cleanString(tokenPart?.data ? Buffer.from(tokenPart.data).toString() : '', 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token)
  if (!result || result.request.id !== requestId) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  if (result.request.user_id && result.request.user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  if (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  const existingVideos = await queryFirst<{ count: number }>(db, `
    SELECT COUNT(*) AS count
    FROM review_media
    WHERE review_request_id = ? AND kind = 'video' AND status != 'deleted'
  `, [requestId])
  if (Number(existingVideos?.count ?? 0) >= 2) return jsonResponse({ error: 'You can upload up to 2 videos.' }, { status: 400 })

  const filePart = formData.find(part => part.name === 'file')
  if (!filePart?.data) return jsonResponse({ error: 'file field required' }, { status: 400 })

  const detectedContentType = sniffMediaMimeType(filePart.data)
  const declaredContentType = typeof filePart.type === 'string'
    ? filePart.type.split(';', 1)[0]?.toLowerCase().trim() || ''
    : ''
  if (!REVIEW_VIDEO_MIME_TYPES.has(detectedContentType)) {
    return jsonResponse({ error: 'Accepted video formats are MP4, MOV, and WebM.' }, { status: 415 })
  }
  if (declaredContentType && declaredContentType !== detectedContentType) {
    return jsonResponse({ error: 'File type mismatch' }, { status: 400 })
  }
  if (filePart.data.byteLength > REVIEW_VIDEO_MAX_BYTES) {
    return jsonResponse({ error: 'Videos must be under 250 MB.' }, { status: 413 })
  }

  const uploaded = await uploadResolvedMediaToAssetStore({
    db,
    env,
    siteId: result.context.site_id,
    organizationId: result.context.organization_id,
    userId: sessionUser.id,
    buffer: toArrayBuffer(filePart.data),
    contentType: detectedContentType,
    filename: sanitizeFilename(filePart.filename),
    kind: 'video',
    source: 'uploaded',
    provider: 'cloudflare_r2',
    locationId: result.context.location_id,
    category: 'other',
    fileSize: filePart.data.byteLength,
  })

  const mediaLinkId = crypto.randomUUID()
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO review_media (id, review_request_id, customer_id, media_asset_id, kind, sort_order, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'video', ?, 'pending', ?, ?)
  `, [mediaLinkId, requestId, result.request.customer_id, uploaded.assetId, Number(existingVideos?.count ?? 0), now, now])
  await execute(db, `
    UPDATE review_requests
    SET user_id = COALESCE(user_id, ?),
        anonymous_user_id = COALESCE(anonymous_user_id, ?),
        updated_at = ?
    WHERE id = ?
  `, [sessionUser.isAnonymous ? null : sessionUser.id, sessionUser.isAnonymous ? sessionUser.id : null, now, requestId])

  return jsonResponse({
    assetId: uploaded.assetId,
    mediaId: mediaLinkId,
    publicUrl: uploaded.publicUrl,
    thumbnailUrl: uploaded.thumbnailUrl,
    kind: 'video',
    status: 'pending',
  }, { status: 201 })
})
