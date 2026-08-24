import { defineHandler } from 'nitro';
import { getQuery, getRouterParam } from 'nitro/h3';
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertResourceAccess } from '~/server/utils/member-access'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { sniffMediaMimeType, VIDEO_MIME_TYPES, MAX_VIDEO_BYTES, POSTER_IMAGE_MIME_TYPES, MAX_POSTER_BYTES } from '~/server/utils/media-mime'

const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo'])
const MULTIPART_OVERHEAD_BYTES = 64 * 1024
type MediaCategory = 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other' | 'logo'

function sanitizeFilename(raw: string | undefined): string {
  const sanitized = (raw ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'upload'
}

function queryValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export default defineHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await queryFirst<{ organization_id: string }>(
      db, `SELECT organization_id FROM sites WHERE id = ? LIMIT 1`, [siteId], )
    if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

    const membership = await queryFirst<{ userId: string; member_id: string; member_role: string }>(db, `
      SELECT m.userId, m.id AS member_id, m.role AS member_role
      FROM member m
      WHERE m.organizationId = ?
        AND m.userId = ?
      LIMIT 1
    `, [site.organization_id, session.user.id])
    if (!membership) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const query = getQuery(event)
    const locationId = queryValue(query.locationId)
    if (locationId) {
      const location = await queryFirst(db, `
        SELECT id
        FROM business_locations
        WHERE id = ? AND site_id = ? AND organization_id = ?
        LIMIT 1
      `, [locationId, siteId, site.organization_id])
      if (!location) return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
    }

    await assertResourceAccess(db, {
      memberId: membership.member_id, role: membership.member_role, organizationId: site.organization_id, siteId, resourceLocationId: locationId, })

    const rawCategory = queryValue(query.category)
    let category: MediaCategory | null = null
    if (rawCategory) {
      if (!VALID_CATEGORIES.has(rawCategory)) return jsonResponse({ error: 'Invalid category' }, { status: 400 })
      category = rawCategory as MediaCategory
    }

    const contentLengthHeader = event.req.headers.get('content-length')
    const contentLength = contentLengthHeader && /^\d+$/.test(contentLengthHeader)
      ? Number(contentLengthHeader)
      : contentLengthHeader ? Number.NaN : null
    if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength <= 0)) {
      return jsonResponse({ error: 'Invalid Content-Length header' }, { status: 400 })
    }
    if (contentLength !== null && contentLength > MAX_VIDEO_BYTES + MAX_POSTER_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return jsonResponse({ error: 'Upload too large (max 60 MB)' }, { status: 413 })
    }

    const formData = await event.req.formData()
    const videoPart = formData.get('video')
    const thumbnailPart = formData.get('thumbnail')
    if (!(videoPart instanceof File) || !(thumbnailPart instanceof File)) {
      return jsonResponse({ error: 'video and thumbnail fields are required' }, { status: 400 })
    }
    if (videoPart.size > MAX_VIDEO_BYTES) return jsonResponse({ error: 'File too large (max 50 MB)' }, { status: 413 })
    if (thumbnailPart.size > MAX_POSTER_BYTES) return jsonResponse({ error: 'Thumbnail too large (max 10 MB)' }, { status: 413 })

    const [videoData, thumbnailData] = await Promise.all([
      videoPart.arrayBuffer().then(buffer => new Uint8Array(buffer)),
      thumbnailPart.arrayBuffer().then(buffer => new Uint8Array(buffer)),
    ])

    const videoContentType = sniffMediaMimeType(videoData)
    if (!VIDEO_MIME_TYPES.has(videoContentType)) return jsonResponse({ error: 'Unsupported video file type' }, { status: 415 })
    const thumbnailContentType = sniffMediaMimeType(thumbnailData)
    if (!POSTER_IMAGE_MIME_TYPES.has(thumbnailContentType)) return jsonResponse({ error: 'Unsupported thumbnail file type' }, { status: 415 })

    const filename = sanitizeFilename(videoPart.name || queryValue(query.filename) || undefined)
    const uploaded = await uploadResolvedMediaToAssetStore({
      db,
      env,
      siteId,
      organizationId: site.organization_id,
      userId: session.user.id,
      buffer: videoData,
      contentType: videoContentType,
      filename,
      kind: 'video',
      source: 'uploaded',
      category,
      locationId,
      fileSize: videoData.byteLength,
      poster: {
        buffer: thumbnailData,
        contentType: thumbnailContentType,
        filename: sanitizeFilename(thumbnailPart.name || `${filename}-thumbnail.jpg`),
      },
    })

    return jsonResponse({
      id: uploaded.assetId,
      publicUrl: uploaded.publicUrl,
      thumbnailUrl: uploaded.thumbnailUrl,
      kind: 'video',
      status: 'active',
    })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown media upload error')
    console.error('media_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({
      error: normalizedError instanceof AggregateError ? normalizedError.message : 'Failed to upload media', message: normalizedError.message, }, { status: 500 })
  }
})
