import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteConfig } from '~/server/utils/site-config'
import { execute, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
    LIMIT 1
  `, [siteId, session.user.id])

  if (!site) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  await execute(db, `
    UPDATE google_analytics_connections
    SET status = 'disabled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE organization_id = ? AND site_id = ?
  `, [site.organization_id, site.id])

  await deleteConfig(db, site.organization_id, site.id, 'ga4_property_id')
  await deleteConfig(db, site.organization_id, site.id, 'google_analytics_measurement_id')
  await deleteConfig(db, site.organization_id, site.id, 'search_console_site_url')

  return jsonResponse({ success: true })
})
