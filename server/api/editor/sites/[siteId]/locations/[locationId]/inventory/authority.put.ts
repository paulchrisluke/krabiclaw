import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import type { SetInventoryAuthorityInput } from '~/shared/inventory'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { setInventoryAuthority } from '~/server/utils/inventory'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site, session } = await requireLocationAccess(event, siteId, locationId)
    const input = await readRequiredBody<SetInventoryAuthorityInput>(event)
    const authority = await setInventoryAuthority(db, site.organization_id, siteId, locationId, input, { id: session.user.id, role: site.member_role })
    return jsonResponse({ success: true, authority })
  } catch (error) {
    rethrowHttpError(error)
    console.error('inventory_authority_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to set inventory authority' }, { status: 500 })
  }
})
