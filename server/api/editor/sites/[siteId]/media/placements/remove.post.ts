import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { parseMediaPlacementKey, removeMediaPlacement } from '~/server/utils/media-placement'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  try {
    const { env, db, site } = await requireSiteAccess(event, siteId)
    const body = await readRequiredBody<{ placement?: unknown; asset_id?: unknown }>(event)
    if (typeof body.asset_id !== 'string' || !body.asset_id.trim()) {
      return jsonResponse({ error: 'asset_id is required' }, { status: 400 })
    }
    const result = await removeMediaPlacement(db, {
      env,
      organizationId: site.organization_id,
      siteId,
      memberId: site.member_id,
      role: site.member_role,
      placement: parseMediaPlacementKey(body.placement),
      assetId: body.asset_id,
    })
    return jsonResponse(result)
  } catch (error) {
    rethrowHttpError(error)
    console.error('media_placement_remove_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to remove media' }, { status: 500 })
  }
})
