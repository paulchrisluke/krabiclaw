// POST /api/editor/sites/[siteId]/media/request-upload
// For images: returns a Cloudflare Images one-time uploadUrl + a pending assetId.
// Client uploads directly to uploadUrl (multipart form), then calls /confirm.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteImage, requestImageUpload } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'

interface SiteRow {
  id: string
  organization_id: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(
    `SELECT id, organization_id FROM sites WHERE id = ? LIMIT 1`
  ).bind(siteId).first<SiteRow>()
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

  if (!env.CLOUDFLARE_IMAGES_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
  }

  const body = await readBody(event)
  const rawFilename = typeof body?.filename === 'string' ? body.filename.trim() : ''
  if (rawFilename.length > 255) {
    return jsonResponse({ error: 'Invalid filename' }, { status: 400 })
  }
  if (rawFilename.includes('..') || rawFilename.includes('/') || rawFilename.includes('\\')) {
    return jsonResponse({ error: 'Invalid filename' }, { status: 400 })
  }
  const filename = rawFilename || 'image'

  let locationId: string | null = null
  if (body?.locationId !== undefined && body?.locationId !== null && body?.locationId !== '') {
    if (typeof body.locationId !== 'string') {
      return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
    }

    const trimmedLocationId = body.locationId.trim()
    if (!/^[A-Za-z0-9_-]+$/.test(trimmedLocationId)) {
      return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
    }
    locationId = trimmedLocationId
  }

  const assetId = crypto.randomUUID()
  let imageId = ''
  let uploadUrl = ''
  try {
    const upload = await requestImageUpload(env)
    imageId = upload.imageId
    uploadUrl = upload.uploadUrl

    await createMediaAsset(db, {
      id: assetId,
      organization_id: site.organization_id,
      site_id: siteId,
      location_id: locationId,
      kind: 'image',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflare_image_id: imageId,
      status: 'pending',
      file_name: filename,
      created_by_user_id: session.user.id,
    })
  } catch (error) {
    if (imageId) {
      try {
        await deleteImage(env, imageId)
      } catch (cleanupError) {
        const normalizedCleanupError = cleanupError instanceof Error ? cleanupError : new Error('Unknown cleanup error')
        console.error('media_request_upload_cleanup_failed', {
          siteId,
          assetId,
          imageId,
          error: normalizedCleanupError.message
        })
      }
    }

    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('media_request_upload_failed', {
      siteId,
      assetId,
      imageId,
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to initialize image upload' }, { status: 500 })
  }

  return jsonResponse({ assetId, uploadUrl, imageId })
})
