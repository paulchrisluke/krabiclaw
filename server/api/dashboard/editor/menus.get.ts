// Direct dashboard handler for editor menus.
// Avoids the generic dashboard proxy hop for this request path.
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getMenus } from '~/server/utils/menu-management'

export default defineEventHandler(async (event) => {
  const locationId = getQuery(event).locationId as string | undefined
  const { db, organization, site } = await getDashboardContext(event, { requireSite: true })

  if (!site) {
    return jsonResponse({ error: 'Site not found' }, { status: 404 })
  }

  const menus = await getMenus(db, organization.id, site.id, locationId)

  return jsonResponse({
    success: true,
    menus,
    siteId: site.id,
    locationId
  })
})
