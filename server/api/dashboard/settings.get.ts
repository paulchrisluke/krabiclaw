// Direct dashboard settings handler.
// Avoids the generic dashboard proxy hop for this request path.
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getConfig } from '~/server/utils/site-config'
import { queryFirst } from '~/server/db'
import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const { db, organization, site: dashboardSite } = await getDashboardContext(event, { requireSite: false })

  // No site resolved (no-site-yet or ambiguous multi-site org) is a normal
  // state for this org-level page — return null settings rather than an
  // error so callers like the org settings page can show defaults.
  if (!dashboardSite) {
    return jsonResponse({ success: true, settings: null })
  }

  const site = await queryFirst<Record<string, unknown>>(db, `
    SELECT s.id, s.organization_id, s.subdomain, s.theme, s.status,
           s.primary_location_id, s.public_url, s.custom_domain_status, s.default_currency,
           s.brand_name, s.brand_description, s.logo_url, s.logo_asset_id, s.contact_email,
           s.settings, s.last_published_at, s.created_at, s.updated_at
    FROM sites s
    WHERE s.id = ? AND s.organization_id = ?
    LIMIT 1
  `, [dashboardSite.id, organization.id])

  if (!site) {
    // dashboardSite was already resolved by getDashboardContext, so a miss here means
    // the row vanished or the org/site pairing is broken — a backend contract violation,
    // not the normal "no site selected yet" state handled above.
    throw createError({ statusCode: 500, message: 'Resolved dashboard site not found' })
  }

  const siteSettings = (() => {
    if (!site.settings) return {}
    try {
      return JSON.parse(String(site.settings))
    } catch {
      return {}
    }
  })()

  const siteConfig = await getConfig(db, site.organization_id as string, site.id as string)

  const settings = {
    id: site.id,
    organization_id: site.organization_id,
    site_id: site.id,
    subdomain: site.subdomain,
    theme: site.theme || 'saya',
    status: site.status,
    primary_location_id: site.primary_location_id,
    public_url: site.public_url,
    custom_domain_status: site.custom_domain_status || 'none',
    brand_name: site.brand_name,
    brand_description: site.brand_description,
    logo_url: site.logo_url,
    logo_asset_id: site.logo_asset_id,
    contact_email: site.contact_email,
    brand_color: siteConfig.brand_color || '',
    default_currency: site.default_currency || 'THB',
    social_facebook: siteConfig.social_facebook || '',
    social_instagram: siteConfig.social_instagram || '',
    social_tiktok: siteConfig.social_tiktok || '',
    footer_tagline: siteConfig.footer_tagline || '',
    press_email: siteConfig.press_email || '',
    partnerships_email: siteConfig.partnerships_email || '',
    catering_email: siteConfig.catering_email || '',
    careers_email: siteConfig.careers_email || '',
    google_analytics_measurement_id: siteConfig.google_analytics_measurement_id || '',
    google_site_verification: siteConfig.google_site_verification || '',
    url_structure: siteSettings.url_structure || 'location_subdirectories',
    last_published_at: site.last_published_at,
    created_at: site.created_at,
    updated_at: site.updated_at
  }

  return jsonResponse({
    success: true,
    settings
  })
})
