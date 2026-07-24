// DELETE /api/editor/sites/[siteId]/media/[assetId]
// Soft-deletes in DB and hard-deletes from Cloudflare Images or R2.
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteMediaAsset } from '~/server/utils/media-asset-manager'
import { anonymizeId } from '~/server/utils/platform-telemetry'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { queryFirst } from '~/server/db'

interface MediaAssetSiteRow {
  id: string
  site_id: string
  organization_id: string
  location_id: string | null
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

  const asset = await queryFirst<MediaAssetSiteRow>(db,
    `SELECT id, site_id, organization_id, location_id FROM media_assets WHERE id = ? LIMIT 1`,
    [assetId]
  )
  if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
  if (asset.site_id !== siteId) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  try {
    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: asset.location_id,
    })

    await deleteMediaAsset(db, env, assetId, siteId, session.user.id)
    return jsonResponse({ deleted: true })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const hashedUserId = anonymizeId(session.user.id, env)
    console.error('media_delete_failed', {
      siteId,
      assetId,
      hashedUserId,
      error: normalizedError.message
    })
    throw error
  }
})
