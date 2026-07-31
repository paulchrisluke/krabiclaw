import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertResourceAccess } from '~/server/utils/member-access'
import { sniffMediaMimeType, POSTER_IMAGE_MIME_TYPES, MAX_POSTER_BYTES } from '~/server/utils/media-mime'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { replaceVideoPoster } from '~/server/utils/media-asset-manager'

interface MediaAssetSiteRow {
  id: string
  site_id: string
  organization_id: string
  location_id: string | null
  kind: string
}

function sanitizeFilename(raw: string | undefined): string {
  const sanitized = (raw ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'poster-image'
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.slice().buffer
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const assetId = getRouterParam(event, 'assetId')
  if (!siteId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  try {
    const asset = await queryFirst<MediaAssetSiteRow>(
      db,
      `SELECT id, site_id, organization_id, location_id, kind FROM media_assets WHERE id = ? AND site_id = ? LIMIT 1`,
      [assetId, siteId],
    )
    if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
    if (asset.kind !== 'video') return jsonResponse({ error: 'Poster images can only be added to videos' }, { status: 400 })

    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: asset.location_id,
    })

    const formData = await readMultipartFormData(event)
    if (!formData) return jsonResponse({ error: 'Multipart form data required' }, { status: 400 })

    const posterPart = formData.find(part => part.name === 'poster' && part.data)
    if (!posterPart?.data) return jsonResponse({ error: 'poster field required' }, { status: 400 })

    const detectedContentType = sniffMediaMimeType(posterPart.data)
    const declaredContentType = typeof posterPart.type === 'string'
      ? posterPart.type.split(';', 1)[0]?.toLowerCase().trim() || ''
      : ''
    const filename = sanitizeFilename(posterPart.filename || 'poster-image')

    if (posterPart.data.byteLength > MAX_POSTER_BYTES) {
      return jsonResponse({ error: 'Poster image too large (max 10 MB)' }, { status: 413 })
    }
    if (!POSTER_IMAGE_MIME_TYPES.has(detectedContentType)) {
      return jsonResponse({ error: `Unsupported poster image type: ${detectedContentType}` }, { status: 415 })
    }
    if (declaredContentType && declaredContentType !== detectedContentType) {
      return jsonResponse({ error: 'Poster file type mismatch' }, { status: 400 })
    }

    const thumbnailUrl = await replaceVideoPoster(db, env, {
      assetId,
      siteId,
      userId: session.user.id,
      buffer: toArrayBuffer(posterPart.data),
      filename,
      contentType: detectedContentType,
    })

    return jsonResponse({ id: assetId, thumbnailUrl })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown poster upload error')
    console.error('media_poster_upload_failed', {
      siteId,
      assetId,
      userId: session.user.id,
      error: normalizedError.message,
    })
    return jsonResponse({ error: 'Failed to upload poster image' }, { status: 500 })
  }
})
