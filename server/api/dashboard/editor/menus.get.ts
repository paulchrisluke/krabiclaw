// Direct dashboard handler for editor menus.
// Avoids the generic dashboard proxy hop for this request path.
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getMenus } from '~/server/utils/menu-management'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const locationId = getQuery(event).locationId as string | undefined
  const { db, organization, site } = await getDashboardContext(event, { requireSite: true })

  if (!site) {
    return jsonResponse({ error: 'Site not found' }, { status: 404 })
  }
  await assertResourceAccess(db, {
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
    siteId: site.id,
    resourceLocationId: locationId ?? null,
  })

  const menus = await getMenus(db, organization.id, site.id, locationId)

  return jsonResponse({
    success: true,
    menus,
    siteId: site.id,
    locationId
  })
})
