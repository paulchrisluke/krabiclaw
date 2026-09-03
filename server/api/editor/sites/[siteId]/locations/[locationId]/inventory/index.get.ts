import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { listLocationInventory } from '~/server/utils/inventory'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)
    return jsonResponse({ success: true, ...(await listLocationInventory(db, site.organization_id, siteId, locationId)) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('inventory_list_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list inventory' }, { status: 500 })
  }
})
