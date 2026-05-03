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
  const siteUrl = config.search_console_site_url
  if (!siteUrl) {
    return jsonResponse({ rows: [], totals: null, unconfigured: true })
  }

  const accessToken = await getGoogleAccessToken(env)

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const response = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 25,
        dataState: 'all'
      })
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw createError({ statusCode: response.status, message: text.slice(0, 300) })
  }

  const data = await response.json() as {
    rows?: Array<{
      keys: string[]
      clicks: number
      impressions: number
      ctr: number
      position: number
    }>
  }

  const rows = (data.rows ?? []).map(row => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Number((row.ctr * 100).toFixed(1)),
    position: Number(row.position.toFixed(1))
  }))

  const totals = rows.length ? {
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    position: Number((rows.reduce((s, r) => s + r.position, 0) / rows.length).toFixed(1))
  } : null

  return jsonResponse({ rows, totals, startDate, endDate })
})