import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { parseMediaPlacementKey, setMediaPlacement } from '~/server/utils/media-placement'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  try {
    const { env, db, site } = await requireSiteAccess(event, siteId)
    const body = await readRequiredBody<{ placement?: unknown; asset_ids?: unknown }>(event)
    if (!Array.isArray(body.asset_ids) || !body.asset_ids.every(id => typeof id === 'string')) {
      return jsonResponse({ error: 'asset_ids must be an array of strings' }, { status: 400 })
    }
    const result = await setMediaPlacement(db, {
      env,
      organizationId: site.organization_id,
      siteId,
      memberId: site.member_id,
      role: site.member_role,
      placement: parseMediaPlacementKey(body.placement),
      assetIds: body.asset_ids,
    })
    return jsonResponse(result)
  } catch (error) {
    rethrowHttpError(error)
    console.error('media_placement_update_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to update media placement' }, { status: 500 })
  }
})
