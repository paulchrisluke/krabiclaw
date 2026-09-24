import type { GoogleAnalyticsIntegration } from '~/shared/organization-settings'
import { execute, queryFirst } from '~/server/db'
import { googleAccessToken, type GoogleCredentialEnv } from './google-credential'

/**
 * Google Analytics as a product of its own, over the shared Google credential
 * (server/utils/google-credential.ts). This module owns the GA4 property the
 * tenant picked and the measurement id derived from it, and nothing about the
 * account those came from.
 *
 * The measurement id is the part that outlives the connection's details: Zaraz
 * serves it, and a site whose id was set before this flow existed keeps it
 * without a property or a credential beside it. There is one way to write it,
 * which is choosing a property here.
 */

export interface Ga4Property {
  accountName: string
  propertyId: string
  propertyName: string
}

const googleJson = async <T>(url: string, accessToken: string): Promise<T> => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}`)
  }
  return (await response.json()) as T
}

/** The GA4 properties the connected account can read. */
export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  const response = await googleJson<{
    accountSummaries?: Array<{
      account: string
      displayName: string
      propertySummaries?: Array<{ property: string; displayName: string }>
    }>
  }>('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', accessToken)

  const properties: Ga4Property[] = []
  for (const account of response.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      properties.push({
        accountName: account.displayName,
        propertyId: property.property.replace(/^properties\//, ''),
        propertyName: property.displayName,
      })
    }
  }
  return properties
}

/**
 * The property's web data stream measurement id — what the page actually
 * needs, so the tenant is never asked to go and find a `G-XXXXXXX` themselves.
 */
export async function getGa4MeasurementId(accessToken: string, propertyId: string): Promise<string | null> {
  const response = await googleJson<{ dataStreams?: Array<{ webStreamData?: { measurementId?: string } }> }>(
    `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams?pageSize=200`, accessToken,
  )
  for (const stream of response.dataStreams ?? []) {
    if (stream.webStreamData?.measurementId) return stream.webStreamData.measurementId
  }
  return null
}

export async function readAnalyticsIntegration(
  env: GoogleCredentialEnv,
  organizationId: string,
): Promise<GoogleAnalyticsIntegration | null> {
  return await queryFirst<GoogleAnalyticsIntegration>(env.DB, `
    SELECT json_extract(integrations_json, '$.google_analytics.revision') AS revision,
           json_extract(integrations_json, '$.google_analytics.property_id') AS property_id,
           json_extract(integrations_json, '$.google_analytics.property_name') AS property_name,
           json_extract(integrations_json, '$.google_analytics.measurement_id') AS measurement_id,
           json_extract(integrations_json, '$.google_analytics.status') AS status,
           json_extract(integrations_json, '$.google_analytics.created_at') AS created_at,
           json_extract(integrations_json, '$.google_analytics.updated_at') AS updated_at
      FROM organization
     WHERE id = ?
       AND json_extract(integrations_json, '$.google_analytics') IS NOT NULL
     LIMIT 1
  `, [organizationId]) ?? null
}

/** Records the chosen property. Refuses when the record moved since it was read. */
export async function storeAnalyticsSelection(
  env: GoogleCredentialEnv,
  organizationId: string,
  selection: { property_id: string; property_name: string; measurement_id: string },
  expected: { revision: string | null },
): Promise<void> {
  if (!env.DB) throw new Error('Database not available')
  const now = new Date().toISOString()
  const payload = JSON.stringify({
    revision: crypto.randomUUID(),
    property_id: selection.property_id,
    property_name: selection.property_name,
    measurement_id: selection.measurement_id,
    status: 'active',
    created_at: now,
    updated_at: now,
  })
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.google_analytics',
      json_set(json(?), '$.created_at', COALESCE(json_extract(integrations_json, '$.google_analytics.created_at'), ?)))
    WHERE id = ?
      AND json_extract(integrations_json, '$.google_analytics.revision') IS ?
  `, [payload, now, organizationId, expected.revision])
  if (result.meta?.changes !== 1) throw new Error('Google Analytics settings changed. Reload before saving.')
}

/** Clears Analytics state. The shared credential is not this function's to touch. */
export async function clearAnalyticsIntegration(
  env: GoogleCredentialEnv,
  organizationId: string,
): Promise<void> {
  if (!env.DB) throw new Error('Database not available')
  const result = await execute(env.DB, `
    UPDATE organization SET integrations_json = json_remove(integrations_json, '$.google_analytics')
    WHERE id = ?
  `, [organizationId])
  if (result.meta?.changes !== 1) throw new Error('Organization ownership changed. Reload before disconnecting.')
}

/** Picks the property and resolves its measurement id in one step. */
export async function selectAnalyticsProperty(
  env: GoogleCredentialEnv,
  organizationId: string,
  propertyId: string,
  propertyName: string,
  expected: { revision: string | null },
): Promise<string> {
  const accessToken = await googleAccessToken(env, organizationId)
  const measurementId = await getGa4MeasurementId(accessToken, propertyId)
  if (!measurementId) {
    throw new Error('That property has no web data stream, so there is no measurement ID to collect with.')
  }
  await storeAnalyticsSelection(env, organizationId, {
    property_id: propertyId, property_name: propertyName, measurement_id: measurementId,
  }, expected)
  return measurementId
}
