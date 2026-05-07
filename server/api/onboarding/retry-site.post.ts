// Retry onboarding for failed/incomplete sites
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getSayaThemeSeedContent, getDefaultMenuSeedData } from '../../utils/content-seeding'

interface RetrySiteRequest {
  siteId: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as RetrySiteRequest
  const { siteId } = body
  
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
  
  // Get authenticated user from Better Auth session
  const headers = getHeaders(event)
  const session = await $fetch('/api/auth/get-session', {
    headers: {
      cookie: headers.cookie || '',
      authorization: headers.authorization || ''
    }
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }
  
  try {
    // Get site details and verify ownership
    const site = await db.prepare(`
      SELECT s.*, o.name as organization_name FROM sites s
      JOIN organization o ON s.organization_id = o.id
      WHERE s.id = ? AND o.id IN (
        SELECT organizationId FROM member WHERE userId = ?
      )
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }
    
    // Only retry if site is in pending/failed state
    if (site.onboarding_status === 'active') {
      return jsonResponse({
        message: 'Site setup is already complete',
        site
      })
    }
    
    // Mark site as pending (retrying)
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'pending', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), siteId).run()
    
    // Perform required seeding
    const contentSeedData = getSayaThemeSeedContent({
      organizationId: site.organization_id,
      siteId,
      restaurantName: site.organization_name
    })
    
    // Seed required content
    for (const content of contentSeedData) {
      await db.prepare(`
        INSERT OR REPLACE INTO site_content (
          organization_id, site_id, location_id, page, field,
          content, type, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        content.organization_id,
        content.site_id,
        content.location_id,
        content.page,
        content.field,
        content.content,
        content.type,
        content.updated_at
      ).run()
    }
    
    // Seed required menu
    const menuSeedData = getDefaultMenuSeedData({
      organizationId: site.organization_id,
      siteId,
      restaurantName: site.organization_name
    })
    
    // Insert menu
      await db.prepare(`
        INSERT OR REPLACE INTO menus (
          id, organization_id, site_id, location_id, name, 
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        menuSeedData.menu.id,
        menuSeedData.menu.organization_id,
        menuSeedData.menu.site_id,
        menuSeedData.menu.location_id,
        menuSeedData.menu.name,
        menuSeedData.menu.status,
        menuSeedData.menu.created_at,
        menuSeedData.menu.updated_at
    ).run()
    
    // Insert required menu items
    for (const item of menuSeedData.items) {
      await db.prepare(`
        INSERT OR REPLACE INTO menu_items (
          id, menu_id, section, name, description, price, 
          available, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id,
        item.menu_id,
        item.section,
        item.name,
        item.description,
        item.price,
        item.available,
        item.sort_order,
        item.created_at,
        item.updated_at
      ).run()
    }
    
    // Mark site as active (success)
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'active', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), siteId).run()
    
    return jsonResponse({
      message: 'Site setup completed successfully',
      siteId,
      onboarding_status: 'active'
    })
    
  } catch (error) {
    console.error('Retry onboarding failed:', error)
    
    // Mark site as failed
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'failed', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), siteId).run()
    
    return jsonResponse({ 
      error: 'Failed to complete site setup' 
    }, { status: 500 })
  }
})
