import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import {
  getGoogleAnalyticsAccessToken,
  getGoogleAnalyticsConnection,
  getGa4MeasurementId
} from '~/server/utils/google-analytics'
import { deleteConfig, setConfig } from '~/server/utils/site-config'

interface SelectBody {
  ga4_property_id?: string | null
  ga4_property_name?: string | null
  search_console_site_url?: string | null
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const body = await readBody<SelectBody>(event)
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
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

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  const connection = await getGoogleAnalyticsConnection(env, site.organization_id, site.id)
  if (!connection) {
    return jsonResponse({ error: 'No Google Analytics connection found for this site' }, { status: 404 })
  }

  const ga4PropertyId = typeof body.ga4_property_id === 'string' ? body.ga4_property_id.trim() : null
  const ga4PropertyName = typeof body.ga4_property_name === 'string' ? body.ga4_property_name.trim() : null
  const searchConsoleSiteUrl = typeof body.search_console_site_url === 'string' ? body.search_console_site_url.trim() : null

  try {
    let measurementId: string | null = null
    if (ga4PropertyId) {
      const accessToken = await getGoogleAnalyticsAccessToken(env, site.organization_id, site.id)
      measurementId = await getGa4MeasurementId(accessToken, ga4PropertyId)
    }

    await db.prepare(`
      UPDATE google_analytics_connections
      SET ga4_property_id = ?, ga4_property_name = ?, ga4_measurement_id = ?,
          search_console_site_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `).bind(ga4PropertyId, ga4PropertyName, measurementId, searchConsoleSiteUrl, connection.id).run()

    if (ga4PropertyId) {
      await setConfig(db, site.organization_id, site.id, 'ga4_property_id', ga4PropertyId)
    } else {
      await deleteConfig(db, site.organization_id, site.id, 'ga4_property_id')
    }
    if (measurementId) {
      await setConfig(db, site.organization_id, site.id, 'google_analytics_measurement_id', measurementId)
    } else {
      await deleteConfig(db, site.organization_id, site.id, 'google_analytics_measurement_id')
    }
    if (searchConsoleSiteUrl) {
      await setConfig(db, site.organization_id, site.id, 'search_console_site_url', searchConsoleSiteUrl)
    } else {
      await deleteConfig(db, site.organization_id, site.id, 'search_console_site_url')
    }

    return jsonResponse({ success: true, ga4_measurement_id: measurementId })
  } catch (error) {
    console.error('Failed to save Google Analytics selection:', error)
    return jsonResponse({ error: 'Failed to save selection. Try again.' }, { status: 502 })
  }
})
