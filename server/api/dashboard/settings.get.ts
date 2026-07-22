// Direct dashboard settings handler.
// Avoids the generic dashboard proxy hop for this request path.
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { loadSettingsPayload } from '~/server/utils/site-settings'

export default defineEventHandler(async (event) => {
  const { db, organization, site: dashboardSite } = await getDashboardContext(event, { requireSite: true })
  if (!dashboardSite) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  await assertSiteWideAccess(db, {
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
    siteId: dashboardSite.id,
  })

  const settings = await loadSettingsPayload(db, organization.id, dashboardSite.id)

  return jsonResponse({
    success: true,
    settings
  })
})
