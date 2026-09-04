// POST /api/editor/sites/[siteId]/media/request-upload
// For images: returns a Cloudflare Images one-time uploadUrl + a pending assetId.
// Client uploads directly to uploadUrl (multipart form), then calls /confirm.
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { deleteImage, hasCloudflareImagesConfig, requestImageUpload } from '~/server/utils/cloudflare-images'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { requireSiteAccess } from '~/server/utils/location-access'

const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other'])
type MediaCategory = 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other'

export default defineHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const { env, db, session, site } = await requireSiteAccess(event, siteId)

    if (!hasCloudflareImagesConfig(env)) {
      return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
    }

    const body = await readRequiredBody<{ filename?: unknown; category?: unknown }>(event)
    const rawFilename = typeof body?.filename === 'string' ? body.filename.trim() : ''
    if (rawFilename.length > 255) {
      return jsonResponse({ error: 'Invalid filename' }, { status: 400 })
    }
    if (rawFilename.includes('..') || rawFilename.includes('/') || rawFilename.includes('\\')) {
      return jsonResponse({ error: 'Invalid filename' }, { status: 400 })
    }
    const filename = rawFilename || 'image'

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
        id: assetId, organization_id: site.organization_id, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'uploaded', cloudflare_image_id: imageId, status: 'pending', file_name: filename, category, created_by_user_id: session.user.id, })
    } catch (error) {
      if (imageId) {
        try {
          await deleteImage(env, imageId)
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError], `Image upload setup failed: ${error instanceof Error ? error.message : String(error)}; Cloudflare Images cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, { cause: cleanupError }, )
        }
      }
      throw error
    }

    return jsonResponse({ asset_id: assetId, upload_url: uploadUrl, provider_id: imageId })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown image upload request error')
    console.error('media_request_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({
      error: 'Failed to initialize image upload', message: normalizedError.message
    }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
