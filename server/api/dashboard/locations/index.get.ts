import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const { db, organization, restaurant } = await getDashboardContext(event, { requireRestaurant: true })

  const rows = await db.prepare(`
    SELECT id, slug, title, is_primary, status, phone, email, notification_phone
    FROM business_locations
    WHERE organization_id = ? AND site_id = ?
    ORDER BY is_primary DESC, title ASC
  `).bind(organization.id, restaurant.id).all<{
    id: string; slug: string; title: string; is_primary: boolean; status: string
    phone: string | null; email: string | null; notification_phone: string | null
  }>()

  return jsonResponse({ locations: rows.results ?? [] })
})
