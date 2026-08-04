import type { H3Event } from 'h3'
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { loadDashboardContext } from '~/server/utils/dashboard-context-service'
import { getNotificationsSettings } from '~/server/utils/mcp-workflows'

export async function loadTransferOnboardingContext(event: H3Event) {
  const context = await loadDashboardContext(event, { afterTransfer: true })
  if (!context.site) {
    throw createError({ statusCode: 404, statusMessage: 'Transferred site not found' })
  }
  const db = cloudflareEnv(event).DB
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const [locations, notifications] = await Promise.all([
    queryAll<{
      id: string
      title: string
      slug: string
      is_primary: number | boolean
      notification_phone: string | null
    }>(db, `
      SELECT id, title, slug, is_primary, notification_phone
        FROM business_locations
       WHERE organization_id = ? AND site_id = ? AND status = 'active'
       ORDER BY is_primary DESC, title ASC
    `, [context.site.organization_id, context.site.id]),
    getNotificationsSettings(db, context.site.organization_id, context.site.id),
  ])
  return {
    success: true as const,
    organization: context.organization,
    site: context.site,
    locations: locations.map(location => ({
      ...location,
      is_primary: Boolean(location.is_primary),
    })),
    notifications,
  }
}
