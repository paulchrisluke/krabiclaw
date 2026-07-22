// POST /api/editor/sites/[siteId]/media/request-upload
// For images: returns a Cloudflare Images one-time uploadUrl + a pending assetId.
// Client uploads directly to uploadUrl (multipart form), then calls /confirm.
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteImage, hasCloudflareImagesConfig, requestImageUpload } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { assertResourceAccess } from '~/server/utils/member-access'

interface SiteRow {
  id: string
  organization_id: string
}

const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo'])
type MediaCategory = 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other' | 'logo'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await queryFirst<SiteRow>(
      db,
      `SELECT id, organization_id FROM sites WHERE id = ? LIMIT 1`,
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

    if (!hasCloudflareImagesConfig(env)) {
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
      const location = await queryFirst(db, `
        SELECT id
        FROM business_locations
        WHERE id = ? AND site_id = ? AND organization_id = ?
        LIMIT 1
      `, [trimmedLocationId, siteId, site.organization_id])
      if (!location) return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
      locationId = trimmedLocationId
    }

    await assertResourceAccess(db, {
      memberId: membership.member_id,
      role: membership.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: locationId,
    })

    let category: MediaCategory | null = null
    if (body?.category !== undefined && body?.category !== null && body?.category !== '') {
      if (typeof body.category !== 'string') return jsonResponse({ error: 'Invalid category' }, { status: 400 })
      const normalizedCategory = body.category.trim()
      if (!VALID_CATEGORIES.has(normalizedCategory)) return jsonResponse({ error: 'Invalid category' }, { status: 400 })
      category = normalizedCategory as MediaCategory
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
        category,
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
      throw error
    }

    return jsonResponse({ assetId, uploadUrl, imageId })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown image upload request error')
    console.error('media_request_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({ 
      error: 'Failed to initialize image upload', 
      message: normalizedError.message 
    }, { status: 500 })
  }
})
