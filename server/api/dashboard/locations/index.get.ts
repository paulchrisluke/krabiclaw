import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { queryAll } from '~/server/db'
import { isOrganizationWideRole } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const { db, organization, site } = await getDashboardContext(event, { requireSite: true })

  if (!site) {
    return jsonResponse({ error: 'Site not found' }, { status: 404 })
  }

  const scoped = !isOrganizationWideRole(organization.role)
  const locations = await queryAll<{
    id: string; slug: string; title: string; is_primary: boolean; status: string
    phone: string | null; email: string | null; notification_phone: string | null
  }>(db, `
    SELECT id, slug, title, is_primary, status, phone, email, notification_phone
    FROM business_locations
    WHERE organization_id = ? AND site_id = ?
      ${scoped ? `AND EXISTS (
        SELECT 1 FROM member_access_scope mas
        WHERE mas.member_id = ? AND mas.organization_id = business_locations.organization_id
          AND mas.site_id = business_locations.site_id
          AND (mas.location_id IS NULL OR mas.location_id = business_locations.id)
      )` : ''}
    ORDER BY is_primary DESC, title ASC
  `, scoped ? [organization.id, site.id, organization.memberId] : [organization.id, site.id])

  return jsonResponse({ success: true, locations })
})
