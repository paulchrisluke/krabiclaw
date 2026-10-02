import { linkedAccountAccessToken, type CloudflareEnv } from './auth'
import { storeIntegration } from './organization-integrations'

/**
 * Google Analytics as a product of its own, over a Better Auth linked Google
 * account. This module owns the GA4 property the tenant picked, the
 * measurement id derived from it, and the `account_id` it was picked through;
 * the account and its tokens are Better Auth's.
 *
 * The measurement id is what Zaraz serves. There is one way to write it,
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

/** Picks the property and resolves its measurement id in one step. */
export async function selectAnalyticsProperty(
  env: CloudflareEnv,
  organizationId: string,
  accountId: string,
  propertyId: string,
  propertyName: string,
  expected: { revision: string | null },
): Promise<string> {
  const { accessToken } = await linkedAccountAccessToken(env, accountId)
  const measurementId = await getGa4MeasurementId(accessToken, propertyId)
  if (!measurementId) {
    throw new Error('That property has no web data stream, so there is no measurement ID to collect with.')
  }
  await storeIntegration(env.DB, organizationId, 'google_analytics', {
    account_id: accountId, target_id: propertyId, target_name: propertyName, measurement_id: measurementId,
  }, expected)
  return measurementId
}
