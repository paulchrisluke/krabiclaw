import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { extractProductsFromMediaAsset, saveInboundMediaAsset } from '~/server/utils/chowbot-media'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, env, session, site } = await requireLocationAccess(event, siteId, locationId)
    const contentType = event.req.headers.get('content-type') ?? ''
    let assetId: string
    if (contentType.includes('multipart/form-data')) {
      const form = await event.req.formData()
      const file = form.get('file')
      if (!(file instanceof File) || file.size === 0) return jsonResponse({ error: 'file is required' }, { status: 400 })
      if (file.size > 10 * 1024 * 1024) return jsonResponse({ error: 'File must be 10 MB or smaller' }, { status: 413 })
      const asset = await saveInboundMediaAsset(db, env, {
        organizationId: site.organization_id,
        siteId,
        userId: session.user.id,
        bytes: await file.arrayBuffer(),
        mimeType: file.type,
        fileSize: file.size,
        filename: file.name,
      })
      assetId = asset.id
    } else {
      const body = await readRequiredBody<{ asset_id?: unknown }>(event)
      if (typeof body.asset_id !== 'string' || !body.asset_id.trim()) {
        return jsonResponse({ error: 'asset_id is required' }, { status: 400 })
      }
      assetId = body.asset_id.trim()
    }
    const result = await extractProductsFromMediaAsset(db, env, {
      organizationId: site.organization_id,
      siteId,
      locationId,
      userId: session.user.id,
      sessionId: session.session.id,
      assetId,
    })
    return jsonResponse({ success: true, site_id: siteId, location_id: locationId, ...result }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_media_extract_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to extract Products from media' }, { status: 500 })
  }
})
