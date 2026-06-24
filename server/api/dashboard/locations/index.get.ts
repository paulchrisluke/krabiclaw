import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { queryAll } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { db, organization, site } = await getDashboardContext(event, { requireSite: true })

  if (!site) {
    return jsonResponse({ error: 'Site not found' }, { status: 404 })
  }

  const locations = await queryAll<{
    id: string; slug: string; title: string; is_primary: boolean; status: string
    phone: string | null; email: string | null; notification_phone: string | null
  }>(db, `
    SELECT id, slug, title, is_primary, status, phone, email, notification_phone
    FROM business_locations
    WHERE organization_id = ? AND site_id = ?
    ORDER BY is_primary DESC, title ASC
  `, [organization.id, site!.id])

  return jsonResponse({ success: true, locations })
})
