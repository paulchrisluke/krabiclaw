// GET /api/editor/sites/[siteId]/media?kind=image&locationId=xxx&limit=50&offset=0
import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardMedia } from '~/server/utils/dashboard-editor-resources'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const query = getQuery(event)
  const id = typeof query.id === 'string' ? query.id : undefined
  const kind = typeof query.kind === 'string' ? query.kind : undefined
  const locationId = typeof query.locationId === 'string' ? query.locationId : undefined
  const search = typeof query.search === 'string' ? query.search : undefined
  const parsedLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : Number.NaN
  const parsedOffset = typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : Number.NaN
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0

  return jsonResponse(await loadDashboardMedia(event, siteId, {
    id,
    kind,
    locationId,
    search,
    limit,
    offset,
  }))
})
import { defineEventHandler } from 'h3'
import { getQuery } from 'h3'
import { getRouterParam } from 'h3'
