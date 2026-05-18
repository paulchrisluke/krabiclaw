// POST /api/editor/sites/[siteId]/media/upload
// Video/file upload via multipart form. File is streamed to R2 via the MEDIA_BUCKET binding.
// Max: 50 MB. Client receives an active media_asset immediately.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { uploadToR2, buildR2Key, deleteFromR2 } from '~/server/utils/cloudflare-r2'
import { createMediaAsset } from '~/server/utils/media-asset-manager'

const MAX_BYTES = 50 * 1024 * 1024

const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'])
const IMAGE_MIME_TYPES = new Set(['image/avif'])
const ALLOWED_MIME_TYPES = new Set([...VIDEO_MIME_TYPES, ...IMAGE_MIME_TYPES, 'application/pdf', 'image/svg+xml'])
const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other'])
type MediaCategory = 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other'

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

function sniffMimeType(data: Uint8Array): string {
  if (data.byteLength >= 5 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46 && data[4] === 0x2d) {
    return 'application/pdf'
  }

  if (data.byteLength >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) {
    return 'video/webm'
  }

  if (data.byteLength >= 12
    && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46
    && data[8] === 0x41 && data[9] === 0x56 && data[10] === 0x49 && data[11] === 0x20) {
    return 'video/x-msvideo'
  }

  if (data.byteLength >= 12
    && data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
    const brand = String.fromCharCode(data[8] ?? 0, data[9] ?? 0, data[10] ?? 0, data[11] ?? 0).toLowerCase()
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif'
    if (brand.startsWith('qt')) return 'video/quicktime'
    return 'video/mp4'
  }

  const sample = new TextDecoder().decode(data.slice(0, Math.min(data.byteLength, 1024))).trimStart().toLowerCase()
  if (sample.startsWith('<svg') || (sample.startsWith('<?xml') && sample.includes('<svg'))) {
    return 'image/svg+xml'
  }

  return 'application/octet-stream'
}

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.REVIEWS_DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await db.prepare(
      `SELECT organization_id FROM sites WHERE id = ? LIMIT 1`
    ).bind(siteId).first<{ organization_id: string }>()
    if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

    const membership = await db.prepare(`
      SELECT m.userId
      FROM member m
      WHERE m.organizationId = ?
        AND m.userId = ?
        AND m.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(site.organization_id, session.user.id).first()
    if (!membership) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const formData = await readMultipartFormData(event)
    if (!formData) return jsonResponse({ error: 'Multipart form data required' }, { status: 400 })

    const filePart = formData.find(p => p.name === 'file')
    if (!filePart?.data) return jsonResponse({ error: 'file field required' }, { status: 400 })

    const detectedContentType = sniffMimeType(filePart.data)
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
    if (fileSize > MAX_BYTES) {
      return jsonResponse({ error: 'File too large (max 50 MB)' }, { status: 413 })
    }

    const locationIdPart = formData.find(p => p.name === 'locationId')
    let locationId: string | null = null
    if (locationIdPart?.data) {
      const candidate = Buffer.from(locationIdPart.data).toString().trim()
      if (candidate) {
        const location = await db.prepare(`
          SELECT id
          FROM business_locations
          WHERE id = ? AND site_id = ? AND organization_id = ?
          LIMIT 1
        `).bind(candidate, siteId, site.organization_id).first()
        if (!location) {
          return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
        }
        locationId = candidate
      }
    }

    const categoryPart = formData.find(p => p.name === 'category')
    let category: MediaCategory | null = null
    if (categoryPart?.data) {
      const candidate = Buffer.from(categoryPart.data).toString().trim()
      if (candidate) {
        if (!VALID_CATEGORIES.has(candidate)) return jsonResponse({ error: 'Invalid category' }, { status: 400 })
        category = candidate as MediaCategory
      }
    }

    const assetId = crypto.randomUUID()
    const kind = VIDEO_MIME_TYPES.has(contentType) ? 'video' : IMAGE_MIME_TYPES.has(contentType) ? 'image' : 'file'
    const r2Key = buildR2Key(siteId, assetId, filename)

    const publicUrl = await uploadToR2(env, r2Key, filePart.data, contentType)

    try {
      await createMediaAsset(db, {
        id: assetId,
        organization_id: site.organization_id,
        site_id: siteId,
        location_id: locationId,
        kind,
        provider: 'cloudflare_r2',
        source: 'uploaded',
        r2_key: r2Key,
        public_url: publicUrl,
        mime_type: contentType,
        file_name: filename,
        file_size: fileSize,
        category,
        status: 'active',
        created_by_user_id: session.user.id,
      })
    } catch (dbError) {
      try {
        await deleteFromR2(env, r2Key)
      } catch (cleanupError) {
        const normalizedCleanupError = cleanupError instanceof Error ? cleanupError : new Error('Unknown error')
        console.error('media_upload_cleanup_failed', {
          siteId,
          assetId,
          r2Key,
          error: normalizedCleanupError.message,
        })
      }
      throw dbError
    }

    return jsonResponse({ id: assetId, publicUrl, kind, status: 'active' })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown media upload error')
    console.error('media_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({ 
      error: 'Failed to upload media', 
      message: normalizedError.message 
    }, { status: 500 })
  }
})
