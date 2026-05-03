import { toWebRequest } from 'h3'
import { isAdminRequest } from '../../../utils/admin-auth'
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getGoogleAccessToken } from '../../../utils/google-business'
import { getConfig } from '../../../utils/site-config'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!(await isAdminRequest(toWebRequest(event), env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!env.REVIEWS_DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  const config = await getConfig(env.REVIEWS_DB)
  const propertyId = config.ga4_property_id
  if (!propertyId) {
    return jsonResponse({ sessions: null, topPages: [], sources: [], unconfigured: true })
  }

  const accessToken = await getGoogleAccessToken(env)

  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'sessions' }],
        dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
        limit: 10
      })
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw createError({ statusCode: response.status, message: text.slice(0, 300) })
  }

  const data = await response.json() as {
    rows?: Array<{
      dimensionValues: Array<{ value: string }>
      metricValues: Array<{ value: string }>
    }>
  }

  const sources = (data.rows ?? []).map(row => ({
    name: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value)
  })).sort((a, b) => b.sessions - a.sessions)

  const sessions = sources.reduce((s, r) => s + r.sessions, 0)

  // Top pages — separate request
  const pagesResponse = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'sessions' }],
        dimensions: [{ name: 'pagePath' }],
        limit: 10,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
      })
    }
  )

  const pagesData = pagesResponse.ok
    ? await pagesResponse.json() as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }
    : { rows: [] }

  const topPages = (pagesData.rows ?? []).map(row => ({
    path: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value)
  }))

  return jsonResponse({ sessions, sources, topPages })
})