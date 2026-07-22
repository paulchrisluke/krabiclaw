// POST /api/editor/sites/[siteId]/media/upload
// Video/file upload via multipart form. File is streamed to R2 via the MEDIA_BUCKET binding.
// Max: 50 MB. Client receives an active media_asset immediately.
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { assertResourceAccess } from '~/server/utils/member-access'
import { sniffMediaMimeType, VIDEO_MIME_TYPES, POSTER_IMAGE_MIME_TYPES, MAX_VIDEO_BYTES, MAX_POSTER_BYTES } from '~/server/utils/media-mime'

const R2_IMAGE_MIME_TYPES = new Set(['image/avif'])
const ALLOWED_MIME_TYPES = new Set([...VIDEO_MIME_TYPES, ...R2_IMAGE_MIME_TYPES, 'application/pdf', 'image/svg+xml'])
const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo'])
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

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.slice().buffer
}

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await queryFirst<{ organization_id: string }>(
      db,
      `SELECT organization_id FROM sites WHERE id = ? LIMIT 1`,
      [siteId],
    )
    if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

    const membership = await queryFirst<{ userId: string; member_id: string; member_role: string }>(db, `
      SELECT m.userId, m.id AS member_id, m.role AS member_role
      FROM member m
      WHERE m.organizationId = ?
        AND m.userId = ?
      LIMIT 1
    `, [site.organization_id, session.user.id])
    if (!membership) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const formData = await readMultipartFormData(event)
    if (!formData) return jsonResponse({ error: 'Multipart form data required' }, { status: 400 })

    const filePart = formData.find(p => p.name === 'file')
    if (!filePart?.data) return jsonResponse({ error: 'file field required' }, { status: 400 })

    const detectedContentType = sniffMediaMimeType(filePart.data)
    const declaredContentType = typeof filePart.type === 'string'
      ? filePart.type.split(';', 1)[0]?.toLowerCase().trim() || ''
      : ''
    const contentType = detectedContentType
    const filename = sanitizeFilename(filePart.filename)
    const fileSize = filePart.data.byteLength

    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return jsonResponse({ error: `Unsupported file type: ${contentType}` }, { status: 415 })
    }
    if (contentType === 'image/svg+xml') {
      return jsonResponse({ error: 'SVG uploads are not supported for security reasons' }, { status: 415 })
    }
    if (declaredContentType && declaredContentType !== contentType) {
      console.warn('media_upload_mime_mismatch', {
        siteId,
        userId: session.user.id,
        declared: declaredContentType,
        detected: contentType,
        filename,
      })
      return jsonResponse({ error: 'File type mismatch' }, { status: 400 })
    }
    if (fileSize > MAX_VIDEO_BYTES) {
      return jsonResponse({ error: 'File too large (max 50 MB)' }, { status: 413 })
    }

    const locationIdPart = formData.find(p => p.name === 'locationId')
    let locationId: string | null = null
    if (locationIdPart?.data) {
      const candidate = Buffer.from(locationIdPart.data).toString().trim()
      if (candidate) {
        const location = await queryFirst(db, `
          SELECT id
          FROM business_locations
          WHERE id = ? AND site_id = ? AND organization_id = ?
          LIMIT 1
        `, [candidate, siteId, site.organization_id])
        if (!location) {
          return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
        }
        locationId = candidate
      }
    }

    await assertResourceAccess(db, {
      memberId: membership.member_id,
      role: membership.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: locationId,
    })

    const categoryPart = formData.find(p => p.name === 'category')
    let category: MediaCategory | null = null
    if (categoryPart?.data) {
      const candidate = Buffer.from(categoryPart.data).toString().trim()
      if (candidate) {
        if (!VALID_CATEGORIES.has(candidate)) return jsonResponse({ error: 'Invalid category' }, { status: 400 })
        category = candidate as MediaCategory
      }
    }

    const posterPart = formData.find(part => part.name === 'poster' && part.data)
    let poster: { buffer: ArrayBuffer; contentType: string; filename: string } | undefined

    if (posterPart?.data) {
      const posterDetectedContentType = sniffMediaMimeType(posterPart.data)
      const posterDeclaredContentType = typeof posterPart.type === 'string'
        ? posterPart.type.split(';', 1)[0]?.toLowerCase().trim() || ''
        : ''
      const posterFilename = sanitizeFilename(posterPart.filename || 'poster-image')
      const posterSize = posterPart.data.byteLength

      if (posterSize > MAX_POSTER_BYTES) {
        return jsonResponse({ error: 'Poster image too large (max 10 MB)' }, { status: 413 })
      }

      if (!POSTER_IMAGE_MIME_TYPES.has(posterDetectedContentType)) {
        return jsonResponse({ error: `Unsupported poster image type: ${posterDetectedContentType}` }, { status: 415 })
      }

      if (posterDeclaredContentType && posterDeclaredContentType !== posterDetectedContentType) {
        return jsonResponse({ error: 'Poster file type mismatch' }, { status: 400 })
      }

      poster = { buffer: toArrayBuffer(posterPart.data), contentType: posterDetectedContentType, filename: posterFilename }
    }

    const kind = VIDEO_MIME_TYPES.has(contentType) ? 'video' : R2_IMAGE_MIME_TYPES.has(contentType) ? 'image' : 'file'

    const uploaded = await uploadResolvedMediaToAssetStore({
      db,
      env,
      siteId,
      organizationId: site.organization_id,
      userId: session.user.id,
      buffer: toArrayBuffer(filePart.data),
      contentType,
      filename,
      kind,
      source: 'uploaded',
      provider: 'cloudflare_r2',
      locationId,
      category,
      fileSize,
      poster,
    })

    return jsonResponse({
      id: uploaded.assetId,
      publicUrl: uploaded.publicUrl,
      thumbnailUrl: uploaded.thumbnailUrl,
      kind,
      status: 'active',
      posterWarning: uploaded.posterWarning,
    })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown media upload error')
    console.error('media_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({
      error: 'Failed to upload media',
      message: normalizedError.message
    }, { status: 500 })
  }
})
