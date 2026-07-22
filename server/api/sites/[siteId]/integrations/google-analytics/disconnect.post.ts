import { jsonResponse } from '~/server/utils/api-response'
import { deleteConfig } from '~/server/utils/site-config'
import { execute } from '~/server/db'
import { removeTenantZarazAnalytics } from '~/server/utils/zaraz-analytics'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const { env, db, site } = await requireSiteAccess(event, siteId)

  await execute(db, `
    UPDATE google_analytics_connections
    SET status = 'disabled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE organization_id = ? AND site_id = ?
  `, [site.organization_id, site.id])

  await deleteConfig(db, site.organization_id, site.id, 'ga4_property_id')
  await deleteConfig(db, site.organization_id, site.id, 'google_analytics_measurement_id')
  await deleteConfig(db, site.organization_id, site.id, 'search_console_site_url')

  try {
    await removeTenantZarazAnalytics(env, db, site.id)
  } catch (error) {
    console.error('zaraz_sync_failed', { siteId: site.id, error })
  }

  return jsonResponse({ success: true })
})
