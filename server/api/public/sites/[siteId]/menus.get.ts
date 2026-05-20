// GET public menu for site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getActiveMenu } from '~/server/utils/menu-management'
import { resolveSiteLocale } from '~/server/utils/site-i18n'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const query = getQuery(event)
  let locationId = typeof query.locationId === 'string' ? query.locationId : undefined
  const requestedLocale = typeof query.locale === 'string' ? query.locale : undefined
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Get site and organization info
    const site = await db.prepare(`
      SELECT id, organization_id, brand_name, status, primary_location_id, default_currency
      FROM sites 
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `).bind(siteId).first<{ id: string; organization_id: string; brand_name: string; status: string; primary_location_id: string | null; default_currency: string | null }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or inactive' 
      }, { status: 404 })
    }

    const localeState = await resolveSiteLocale(db, site, requestedLocale)
    if (!locationId) {
      if (site.primary_location_id) {
        locationId = site.primary_location_id
      } else {
        const primaryLocation = await db.prepare(`
          SELECT id
          FROM business_locations
          WHERE site_id = ? AND status = 'active'
          ORDER BY is_primary DESC, created_at ASC
          LIMIT 1
        `).bind(siteId).first<{ id: string }>()
        locationId = primaryLocation?.id
      }
    }

    const menu = await getActiveMenu(
      db,
      site.organization_id,
      siteId,
      locationId,
      localeState.isSourceLocale ? undefined : localeState.effectiveLocale,
    )
    
    if (!menu) {
      return jsonResponse({
        success: true,
        menu: null,
        message: 'No menu available for this scope',
        siteId,
        locationId,
        locale: localeState.effectiveLocale,
        requestedLocale: localeState.requestedLocale,
        sourceLocale: localeState.sourceLocale,
        currency: site.default_currency || 'THB',
      })
    }

    return jsonResponse({
      success: true,
      menu,
      siteId,
      locationId,
      locale: localeState.effectiveLocale,
      requestedLocale: localeState.requestedLocale,
      sourceLocale: localeState.sourceLocale,
      currency: site.default_currency || 'THB',
    })
    
  } catch (error) {
    console.error('Failed to get public menu:', error)
    return jsonResponse({ 
      error: 'Failed to get menu' 
    }, { status: 500 })
  }
})
