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

    const result = await execute(db, `
      UPDATE organization SET integrations_json = json_set(integrations_json,
        '$.google.ga4_property_id', ?, '$.google.ga4_property_name', ?,
        '$.google.ga4_measurement_id', ?, '$.google.search_console_site_url', ?,
        '$.google.updated_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '$.google.revision', ?)
      WHERE id = ? AND organization_id = ?
        AND json_extract(integrations_json, '$.google.kind') = 'oauth'
        AND json_extract(integrations_json, '$.google.revision') IS ?
    `, [ga4PropertyId, ga4PropertyName, measurementId, searchConsoleSiteUrl, crypto.randomUUID(),
      organization.id, organization.id, connection.revision])
    if (result.meta?.changes !== 1) {
      return jsonResponse({ error: 'Google Analytics connection changed. Reload before selecting a property.' }, { status: 409 })
    }

    try {
      await reconcileZarazAnalytics(env, db)
    } catch (error) {
      console.error('zaraz_reconciliation_failed', { organizationId: organization.id, error })
    }

    return jsonResponse({ success: true, ga4_measurement_id: measurementId })
  } catch (error) {
    console.error('Failed to save Google Analytics selection:', error)
    return jsonResponse({ error: 'Failed to save selection. Try again.' }, { status: 502 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
