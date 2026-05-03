import { toWebRequest } from 'h3'
import { isAdminRequest } from '../../../utils/admin-auth'
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getGoogleAccessToken } from '../../../utils/google-business'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!(await isAdminRequest(toWebRequest(event), env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessToken = await getGoogleAccessToken(env)
  const results: Record<string, unknown> = {}

  // Discover GA4 properties
  try {
    const r = await fetch(
      'https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/-',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await r.json() as { properties?: Array<{ name: string; displayName: string; parent: string }> }
    results.ga4Properties = (data.properties ?? []).map(p => ({
      id: p.name.replace('properties/', ''),
      name: p.displayName,
      parent: p.parent
    }))
  } catch (e) {
    results.ga4Properties = []
    results.ga4Error = e instanceof Error ? e.message : String(e)
  }

  // Discover Search Console sites
  try {
    const r = await fetch(
      'https://www.googleapis.com/webmasters/v3/sites',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await r.json() as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }
    results.gscSites = (data.siteEntry ?? []).map(s => ({
      url: s.siteUrl,
      permission: s.permissionLevel
    }))
  } catch (e) {
    results.gscSites = []
    results.gscError = e instanceof Error ? e.message : String(e)
  }

  return jsonResponse(results)
})
