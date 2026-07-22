// PATCH /api/editor/sites/[siteId]/media/[assetId]
// Update mutable metadata: alt_text only. URLs are managed by Cloudflare.
import { queryFirst, type DbClient } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateMediaAssetMetadata, type MediaAsset } from '~/server/utils/media-asset-manager'
import { assertResourceAccess } from '~/server/utils/member-access'

interface MediaAssetSiteRow {
  id: string
  site_id: string
  organization_id: string
  location_id: string | null
}

interface SiteMemberRow {
  id: string
  member_id: string
  member_role: string
}

const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other'])

async function loadSiteMember(db: DbClient, userId: string, siteId: string): Promise<SiteMemberRow | null> {
  return await queryFirst<SiteMemberRow>(db, `
    SELECT s.id, m.id AS member_id, m.role AS member_role
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ?
    LIMIT 1
  `, [siteId, userId])
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

  const site = await loadSiteMember(db, session.user.id, siteId)
  if (!site) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  try {
    const asset = await queryFirst<MediaAssetSiteRow>(
      db,
      `SELECT id, site_id, organization_id, location_id FROM media_assets WHERE id = ? LIMIT 1`,
      [assetId],
    )
    if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
    if (asset.site_id !== siteId) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const principal = { memberId: site.member_id, role: site.member_role, organizationId: asset.organization_id, siteId }
    await assertResourceAccess(db, { ...principal, resourceLocationId: asset.location_id })

    const body = await readBody(event)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
    }
    const updates: { alt_text?: string | null; location_id?: string | null; category?: MediaAsset['category'] } = {}
    if ('alt_text' in body) {
      if (body.alt_text !== null && typeof body?.alt_text !== 'string') {
        return jsonResponse({ error: 'alt_text must be a string or null' }, { status: 400 })
      }
      updates.alt_text = body.alt_text === null ? null : body.alt_text.trim().slice(0, 500)
    }

    if ('location_id' in body) {
      if (body.location_id !== null && body.location_id !== '' && typeof body.location_id !== 'string') {
        return jsonResponse({ error: 'location_id must be a string or null' }, { status: 400 })
      }
      const locationId = typeof body.location_id === 'string' ? body.location_id.trim() : ''
      if (locationId) {
        const location = await queryFirst(db, `
          SELECT id FROM business_locations
          WHERE id = ? AND site_id = ? AND organization_id = ?
          LIMIT 1
        `, [locationId, siteId, asset.organization_id])
        if (!location) return jsonResponse({ error: 'Invalid location_id' }, { status: 400 })
      }
      // Moving the asset to a different location (or making it site-wide) is
      // itself an access-checked action against the TARGET scope, not just
      // the asset's current one — otherwise a location-scoped editor could
      // reassign media into a location (or site-wide) they don't control.
      await assertResourceAccess(db, { ...principal, resourceLocationId: locationId || null })
      updates.location_id = locationId || null
    }

    if ('category' in body) {
      if (body.category !== null && body.category !== '' && typeof body.category !== 'string') {
        return jsonResponse({ error: 'category must be a string or null' }, { status: 400 })
      }
      const category = typeof body.category === 'string' ? body.category.trim() : ''
      if (category && !VALID_CATEGORIES.has(category)) {
        return jsonResponse({ error: 'Invalid category' }, { status: 400 })
      }
      updates.category = (category || null) as MediaAsset['category']
    }

    const updated = await updateMediaAssetMetadata(db, assetId, siteId, updates)
    if (!updated) return jsonResponse({ error: 'Asset not found' }, { status: 404 })

    return jsonResponse({ updated: true })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('media_patch_failed', {
      siteId,
      assetId,
      userId: session.user.id,
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to update media asset' }, { status: 500 })
  }
})
