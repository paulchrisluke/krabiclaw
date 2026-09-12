import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listCollections } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    const query = getQuery(event)
    // Omitting location_id lists every collection on the site; passing it —
    // including the empty string for site-wide — narrows to that scope. The
    // two are different questions, so neither stands in for the other.
    const locationId = query.location_id === undefined ? undefined : (String(query.location_id) || null)
    const collections = await listCollections(db, { organizationId: site.organization_id, siteId, locationId })
    return jsonResponse({ success: true, collections })
  } catch (error) {
    rethrowHttpError(error)
    console.error('collections_list_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list collections' }, { status: 500 })
  }
})
