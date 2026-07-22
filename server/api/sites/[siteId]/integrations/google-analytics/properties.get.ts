import { jsonResponse } from '~/server/utils/api-response'
import {
  getGoogleAnalyticsAccessToken,
  getGoogleAnalyticsConnection,
  listGa4Properties,
  listSearchConsoleSites
} from '~/server/utils/google-analytics'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const { env, site } = await requireSiteAccess(event, siteId)

  const connection = await getGoogleAnalyticsConnection(env, site.organization_id, site.id)
  if (!connection) {
    return jsonResponse({ success: true, connection: null, ga4Properties: [], searchConsoleSites: [] })
  }

  try {
    const accessToken = await getGoogleAnalyticsAccessToken(env, site.organization_id, site.id)
    const [ga4Result, searchConsoleResult] = await Promise.allSettled([
      listGa4Properties(accessToken),
      listSearchConsoleSites(accessToken)
    ])

    if (ga4Result.status === 'rejected') {
      console.error('Failed to load GA4 properties:', ga4Result.reason)
    }
    if (searchConsoleResult.status === 'rejected') {
      console.error('Failed to load Search Console sites:', searchConsoleResult.reason)
    }

    return jsonResponse({
      success: true,
      connection: {
        provider_account_email: connection.provider_account_email,
        ga4_property_id: connection.ga4_property_id ?? null,
        ga4_property_name: connection.ga4_property_name ?? null,
        search_console_site_url: connection.search_console_site_url ?? null
      },
      ga4Properties: ga4Result.status === 'fulfilled' ? ga4Result.value : [],
      searchConsoleSites: searchConsoleResult.status === 'fulfilled' ? searchConsoleResult.value : [],
      ga4Error: ga4Result.status === 'rejected' ? 'Could not load Analytics properties. Make sure the Google Analytics Admin API is enabled.' : null,
      searchConsoleError: searchConsoleResult.status === 'rejected' ? 'Could not load Search Console properties. Make sure the Search Console API is enabled.' : null
    })
  } catch (error) {
    console.error('Failed to load Google Analytics properties:', error)
    return jsonResponse({ error: 'Failed to load Google account data. Try reconnecting.' }, { status: 502 })
  }
})
