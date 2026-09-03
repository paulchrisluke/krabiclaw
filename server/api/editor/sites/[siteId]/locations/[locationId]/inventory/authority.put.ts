import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import type { SetInventoryAuthorityInput } from '~/shared/inventory'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { setInventoryAuthority } from '~/server/utils/inventory'
import { requireLocationAccess } from '~/server/utils/location-access'
import { hasInventoryAuthorityPermission } from '~/server/utils/auth'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site, session } = await requireLocationAccess(event, siteId, locationId)
    if (!await hasInventoryAuthorityPermission(site.organization_id, site.member_role)) {
      throw new HTTPError({ statusCode: 403, statusMessage: 'Integration management permission is required' })
    }
    const input = await readRequiredBody<SetInventoryAuthorityInput>(event)
    const authority = await setInventoryAuthority(db, site.organization_id, siteId, locationId, input, session.user.id)
    return jsonResponse({ success: true, authority })
  } catch (error) {
    rethrowHttpError(error)
    console.error('inventory_authority_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to set inventory authority' }, { status: 500 })
  }
})
