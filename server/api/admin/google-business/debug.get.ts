import { cloudflareEnv } from '../../../utils/api-response'
import { getGoogleAccessToken, locationName } from '../../../utils/google-business'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const results: Record<string, any> = {}

  // Step 1: Auth check
  let accessToken: string
  try {
    accessToken = await getGoogleAccessToken(env)
    results.auth = 'OK'
  } catch (e) {
    return { auth: 'FAILED', error: e instanceof Error ? e.message : String(e) }
  }

  // Step 2: Test Account Management API
  try {
    const r = await fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const body = await r.json()
    results.accountManagementApi = { status: r.status, body }
  } catch (e) {
    results.accountManagementApi = { error: e instanceof Error ? e.message : String(e) }
  }

  // Step 3: Test Business Information API
  const locName = locationName(env)
  if (locName) {
    try {
      const r = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${locName}?readMask=name,title`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const body = await r.json()
      results.businessInfoApi = { status: r.status, body }
    } catch (e) {
      results.businessInfoApi = { error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    results.businessInfoApi = 'SKIPPED - no GOOGLE_BUSINESS_LOCATION_ID set'
  }

  // Step 4: Test Reviews API
  const accountId = env.GOOGLE_BUSINESS_ACCOUNT_ID?.trim()
  if (accountId && locName) {
    try {
      const r = await fetch(
        `https://mybusiness.googleapis.com/v4/accounts/${accountId}/${locName}/reviews?pageSize=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const body = await r.json()
      results.reviewsApi = { status: r.status, body }
    } catch (e) {
      results.reviewsApi = { error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    results.reviewsApi = 'SKIPPED - missing account or location ID'
  }

  return results
})
