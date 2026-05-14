// GET launch readiness assessment
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import type { LaunchReadiness } from '~/server/types/site'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  
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
      SELECT s.id, s.organization_id, s.name, s.subdomain, s.status, s.public_url,
             s.brand_name, s.brand_description, s.contact_email, s.last_published_at
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first<ApiRecord>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Check site identity
    const siteIdentity = {
      ready: !!(site.name && site.subdomain && site.status === 'active'),
      items: {
        name: !!site.name,
        subdomain: !!site.subdomain,
        theme: true, // Always has Saya theme
        status: site.status === 'active',
        primary_location: true // Optional, not critical
      }
    }

    // Check brand basics
    const brandBasics = {
      ready: !!(site.brand_name && site.brand_description),
      items: {
        brand_name: !!site.brand_name,
        description: !!site.brand_description,
        contact_email: !!site.contact_email
      }
    }

    // Check publishing status
    const publishingStatus = {
      ready: site.status === 'active' && !!site.public_url,
      items: {
        site_active: site.status === 'active',
        public_url: !!site.public_url,
        last_published: !!site.last_published_at
      }
    }

    // Check domain status
    const domainStatus = {
      ready: !!site.subdomain,
      items: {
        subdomain: !!site.subdomain,
        custom_domain: false // Custom domains are optional
      }
    }

    // Check integrations
    const googleBusinessConnection = await db.prepare(`
      SELECT id FROM google_business_connections 
      WHERE organization_id = ? AND status = 'active'
      LIMIT 1
    `).bind(site.organization_id).first()

    const locationsCount = await db.prepare(`
      SELECT COUNT(*) as count FROM business_locations 
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
    `).bind(site.organization_id, siteId).first<{ count: number }>()

    const integrations = {
      ready: !!googleBusinessConnection,
      items: {
        google_business_connected: !!googleBusinessConnection,
        locations_imported: (locationsCount?.count || 0) > 0
      }
    }

    // Check content readiness
    const homepageHero = await db.prepare(`
      SELECT id FROM site_content 
      WHERE organization_id = ? AND site_id = ? AND page = 'home' AND field = 'hero.title'
      LIMIT 1
    `).bind(site.organization_id, siteId).first<{ id: string }>()

    const menuExists = await db.prepare(`
      SELECT id FROM menus 
      WHERE organization_id = ? AND site_id = ? AND location_id IS NULL AND status = 'published'
      LIMIT 1
    `).bind(site.organization_id, siteId).first<{ id: string }>()

    const menuItemsCount = menuExists ? await db.prepare(`
      SELECT COUNT(*) as count FROM menu_items WHERE menu_id = ?
    `).bind(menuExists.id).first<{ count: number }>() : { count: 0 }

    const contactDetails = await db.prepare(`
      SELECT id FROM site_content 
      WHERE organization_id = ? AND site_id = ? AND page = 'contact' AND field = 'email'
      LIMIT 1
    `).bind(site.organization_id, siteId).first<{ count: number }>()

    const seoMetadata = await db.prepare(`
      SELECT COUNT(*) as count FROM site_content 
      WHERE organization_id = ? AND site_id = ? AND page = 'home' 
      AND field IN ('seo.title', 'seo.description')
    `).bind(site.organization_id, siteId).first<{ count: number }>()

    const contentReadiness = {
      ready: !!(homepageHero && menuExists && (menuItemsCount?.count || 0) > 0 && contactDetails),
      items: {
        homepage_hero: !!homepageHero,
        menu_exists: !!menuExists,
        menu_items_exist: (menuItemsCount?.count || 0) > 0,
        contact_details: !!contactDetails,
        locations_exist: (locationsCount?.count || 0) > 0,
        seo_metadata: (seoMetadata?.count || 0) >= 2
      }
    }

    // Calculate overall readiness
    const sections: LaunchReadiness['sections'] = {
      site_identity: siteIdentity,
      brand_basics: brandBasics,
      publishing_status: publishingStatus,
      domain_status: domainStatus,
      integrations: integrations,
      content_readiness: contentReadiness
    }

    const criticalSections = ['site_identity', 'brand_basics', 'content_readiness'] as const
    const overallReady = criticalSections.every(section => sections[section].ready)

    // Generate action items
    const actionItems: Array<{
      section: string
      item: string
      priority: 'critical' | 'optional'
      description: string
      action_url?: string
    }> = []
    
    if (!siteIdentity.items.name) {
      actionItems.push({
        section: 'site_identity',
        item: 'name',
        priority: 'critical' as const,
        description: 'Add a site name',
        action_url: `/dashboard/sites/${siteId}/settings`
      })
    }

    if (!siteIdentity.items.status) {
      actionItems.push({
        section: 'site_identity',
        item: 'status',
        priority: 'critical' as const,
        description: 'Activate your site to make it public',
        action_url: `/dashboard/sites/${siteId}/settings`
      })
    }

    if (!brandBasics.items.brand_name) {
      actionItems.push({
        section: 'brand_basics',
        item: 'brand_name',
        priority: 'critical' as const,
        description: 'Add your restaurant/brand name',
        action_url: `/dashboard/sites/${siteId}/settings`
      })
    }

    if (!brandBasics.items.description) {
      actionItems.push({
        section: 'brand_basics',
        item: 'description',
        priority: 'critical' as const,
        description: 'Add a description of your restaurant',
        action_url: `/dashboard/sites/${siteId}/settings`
      })
    }

    if (!contentReadiness.items.homepage_hero) {
      actionItems.push({
        section: 'content_readiness',
        item: 'homepage_hero',
        priority: 'critical' as const,
        description: 'Add a homepage hero title',
        action_url: '/'
      })
    }

    if (!contentReadiness.items.menu_exists) {
      actionItems.push({
        section: 'content_readiness',
        item: 'menu_exists',
        priority: 'critical' as const,
        description: 'Create a menu for your restaurant',
        action_url: `/dashboard/sites/${siteId}/menu`
      })
    }

    if (!contentReadiness.items.menu_items_exist) {
      actionItems.push({
        section: 'content_readiness',
        item: 'menu_items_exist',
        priority: 'critical' as const,
        description: 'Add menu items to your menu',
        action_url: `/dashboard/sites/${siteId}/menu`
      })
    }

    if (!integrations.items.google_business_connected) {
      actionItems.push({
        section: 'integrations',
        item: 'google_business_connected',
        priority: 'optional' as const,
        description: 'Connect Google Business for reviews and photos',
        action_url: `/dashboard/sites/${siteId}/integrations`
      })
    }

    const launchReadiness: LaunchReadiness = {
      site_id: siteId,
      overall_ready: overallReady,
      missing_critical: actionItems.filter(item => item.priority === 'critical').length,
      missing_optional: actionItems.filter(item => item.priority === 'optional').length,
      sections,
      action_items: actionItems
    }
    
    return jsonResponse({
      success: true,
      launch_readiness: launchReadiness
    })
    
  } catch (error) {
    console.error('Failed to get launch readiness:', error)
    return jsonResponse({ 
      error: 'Failed to get launch readiness' 
    }, { status: 500 })
  }
})
