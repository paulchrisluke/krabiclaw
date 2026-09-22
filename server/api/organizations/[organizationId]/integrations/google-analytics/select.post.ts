import { jsonResponse } from '~/server/utils/api-response'
import { readAnalyticsIntegration, selectAnalyticsProperty } from '~/server/utils/google-analytics'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { reconcileZarazAnalytics } from '~/server/utils/zaraz-analytics'

/**
 * Choosing the GA4 property. This is the only thing that writes a measurement
 * id: it is resolved from the property's web data stream rather than typed in,
 * and Zaraz is reconciled so the tag the site serves matches what was chosen.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const body = await readBody<{ property_id?: string; property_name?: string }>(event).catch(() => null)
  const propertyId = body?.property_id?.trim()
  const propertyName = body?.property_name?.trim()
  if (!propertyId || !propertyName) {
    return jsonResponse({ error: 'Choose an Analytics property.' }, { status: 400 })
  }

  const { env, organization} = await requireOrganizationAccess(event, organizationId)
  const current = await readAnalyticsIntegration(env, organization.id)

  try {
    const measurementId = await selectAnalyticsProperty(
      env, organization.id, propertyId, propertyName,
      { revision: current?.revision ?? null },
    )

    try {
      await reconcileZarazAnalytics(env, env.DB)
    } catch (error) {
      console.error('zaraz_reconciliation_failed', { organizationId: organization.id, error })
    }

    return jsonResponse({ success: true, measurement_id: measurementId })
  } catch (error) {
    console.error('google_analytics_select_failed', { organizationId: organization.id, error })
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Could not select that Analytics property.',
    }, { status: 502 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody } from 'nitro/h3';
