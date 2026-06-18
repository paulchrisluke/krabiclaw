// GET site settings
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getConfig } from '~/server/utils/site-config'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Verify user belongs to organization that owns the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.subdomain, s.theme, s.status,
             s.primary_location_id, s.public_url, s.custom_domain_status, s.default_currency,
             s.brand_name, s.brand_description, s.logo_url, s.logo_asset_id, s.contact_email,
             s.settings, s.last_published_at, s.created_at, s.updated_at,
             o.name as organization_name
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
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
    
  } catch (error) {
    console.error('Failed to get site settings:', error)
    return jsonResponse({ 
      error: 'Failed to get site settings' 
    }, { status: 500 })
  }
})
