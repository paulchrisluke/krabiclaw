import { jsonResponse } from '~/server/utils/api-response'
import {
  getGoogleAnalyticsAccessToken, getGoogleAnalyticsConnection, getGa4MeasurementId
} from '~/server/utils/google-analytics'
import { execute } from '~/server/db'
import { reconcileZarazAnalytics } from '~/server/utils/zaraz-analytics'
import { requireOrganizationAccess } from '~/server/utils/location-access'

interface SelectBody {
  ga4_property_id?: string | null
  ga4_property_name?: string | null
  search_console_site_url?: string | null
}

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  }

  const body = await readBody<SelectBody>(event)
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const { env, db, organization } = await requireOrganizationAccess(event, organizationId)

  const connection = await getGoogleAnalyticsConnection(env, organization.id)
  if (!connection) {
    return jsonResponse({ error: 'No Google Analytics connection found for this site' }, { status: 404 })
  }

  const ga4PropertyId = typeof body.ga4_property_id === 'string' ? body.ga4_property_id.trim() : null
  const ga4PropertyName = typeof body.ga4_property_name === 'string' ? body.ga4_property_name.trim() : null
  const searchConsoleSiteUrl = typeof body.search_console_site_url === 'string' ? body.search_console_site_url.trim() : null

  try {
    let measurementId: string | null = null
    if (ga4PropertyId) {
      const accessToken = await getGoogleAnalyticsAccessToken(env, organization.id)
      measurementId = await getGa4MeasurementId(accessToken, ga4PropertyId)
    }

    // Each Google product the credential serves is its own key, so the picker
    // writes two objects rather than four fields on one. The guard stays on the
    // credential's revision: that is what the connection is.
    const now = new Date().toISOString()
    const revision = crypto.randomUUID()
    const result = await execute(db, `
      UPDATE organization SET integrations_json = json_set(
        CASE WHEN ? IS NULL THEN json_remove(integrations_json, '$.google_search_console')
             ELSE json_set(integrations_json, '$.google_search_console',
               json_object('revision', ?, 'site_url', ?, 'verified', json('true'), 'status', 'active',
                 'created_at', COALESCE(json_extract(integrations_json, '$.google_search_console.created_at'), ?),
                 'updated_at', ?)) END,
        '$.google_analytics', json_object('revision', ?, 'status', 'active',
          'property_id', ?, 'property_name', ?, 'measurement_id', ?,
          'created_at', COALESCE(json_extract(integrations_json, '$.google_analytics.created_at'), ?),
          'updated_at', ?))
      WHERE id = ?
        AND json_extract(integrations_json, '$.google_credential.revision') IS ?
    `, [searchConsoleSiteUrl, revision, searchConsoleSiteUrl, now, now,
      revision, ga4PropertyId, ga4PropertyName, measurementId, now, now,
      organization.id, connection.revision])
    if (result.meta?.changes !== 1) {
      return jsonResponse({ error: 'Google Analytics connection changed. Reload before selecting a property.' }, { status: 409 })
    }

    // The selection is only real once the tracking script carries it, so a failed
    // reconciliation falls through to the 502 below rather than reporting a
    // measurement id the site is not actually sending events to.
    await reconcileZarazAnalytics(env, db)

    return jsonResponse({ success: true, ga4_measurement_id: measurementId })
  } catch (error) {
    console.error('Failed to save Google Analytics selection:', error)
    return jsonResponse({ error: 'Failed to save selection. Try again.' }, { status: 502 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
