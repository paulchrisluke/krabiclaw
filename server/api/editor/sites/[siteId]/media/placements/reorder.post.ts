import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { parseMediaPlacementKey, parseMediaPlacementMoves, reorderMediaPlacements } from '~/server/utils/media-placement'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  try {
    const { env, db, site } = await requireSiteAccess(event, siteId)
    const body = await readRequiredBody<{ placement?: unknown; moves?: unknown }>(event)
    const result = await reorderMediaPlacements(db, {
      env,
      organizationId: site.organization_id,
      siteId,
      memberId: site.member_id,
      role: site.member_role,
      placement: parseMediaPlacementKey(body.placement),
      moves: parseMediaPlacementMoves(body.moves),
    })
    return jsonResponse(result)
  } catch (error) {
    rethrowHttpError(error)
    console.error('media_placement_reorder_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to reorder media' }, { status: 500 })
  }
})
