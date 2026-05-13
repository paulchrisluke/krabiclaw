// Site creation API with idempotency and rollback safety
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getSayaThemeSeedContent, getDefaultMenuSeedData } from '../../utils/content-seeding'
import { getAuthSession } from '../../utils/auth'
import { createSystemSubdomain } from '../../utils/domains'
import { defineEventHandler, readBody } from 'h3'

interface CreateSiteRequest {
  restaurantName: string
  subdomain: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as CreateSiteRequest
  const { restaurantName, subdomain } = body
  
  if (!restaurantName || !subdomain) {
    return jsonResponse({ 
      error: 'Restaurant name and subdomain are required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }
  
  // Get authenticated user from Better Auth session using server-side API
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }
  
  const userId = session.user.id
  const normalizedSubdomain = subdomain.toLowerCase()
  let siteId: string = ''
  
  try {
    // Step 1: Check if user already has organization membership via Better Auth
    let userOrganizations = await db.prepare(`
      SELECT o.* FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      LIMIT 1
    `).bind(userId).first()
    
    let organizationId: string
    
    if (userOrganizations) {
      organizationId = userOrganizations.id
      
      // Guard: Check user's role and existing site count before updating org
      const memberRole = await db.prepare(`
        SELECT role FROM member WHERE organizationId = ? AND userId = ?
      `).bind(organizationId, userId).first() as { role: string } | null
      
      const siteCount = await db.prepare(`
        SELECT COUNT(*) as count FROM sites WHERE organization_id = ?
      `).bind(organizationId).first() as { count: number } | null
      
      // Only update organization if user is owner AND no sites exist yet
      if (memberRole?.role === 'owner' && (siteCount?.count ?? 0) === 0) {
        await db.prepare(`UPDATE organization SET name = ?, slug = ? WHERE id = ?`)
          .bind(restaurantName, restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '-'), organizationId)
          .run()
      }
      
      // Step 2: Check if this organization already has a site with the requested subdomain
      let existingSite = await db.prepare(`
        SELECT id, onboarding_status FROM sites 
        WHERE organization_id = ? AND subdomain = ?
        LIMIT 1
      `).bind(organizationId, normalizedSubdomain).first()
      
      if (existingSite) {
        // Site already exists for this user and subdomain
        if (existingSite.onboarding_status === 'active') {
          return jsonResponse({
            siteId: existingSite.id,
            organizationId,
            subdomain: normalizedSubdomain,
            message: 'Site already exists'
          })
        } else if (existingSite.onboarding_status === 'pending' || existingSite.onboarding_status === 'failed') {
          // Resume incomplete onboarding
          return await resumeOnboarding(env, db, existingSite.id, organizationId, restaurantName)
        }
      }
      
      // Step 3: Check if subdomain is taken by another organization
      let otherOrgSite = await db.prepare(`
        SELECT id FROM sites 
        WHERE subdomain = ? AND organization_id != ?
        LIMIT 1
      `).bind(normalizedSubdomain, organizationId).first()
      
      if (otherOrgSite) {
        return jsonResponse({ 
          error: 'This subdomain is already taken by another restaurant' 
        }, { status: 409 })
      }
    } else {
      // Step 4: Create new organization for first-time user
      organizationId = `org-${userId}-${Date.now()}`
      
      try {
        await db.prepare(`
          INSERT INTO organization (
            id, name, slug, createdAt
          ) VALUES (?, ?, ?, ?)
        `).bind(
          organizationId,
          restaurantName,
          restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          new Date().toISOString()
        ).run()
        
        // Add user as organization member
        await db.prepare(`
          INSERT INTO member (
            id, organizationId, userId, role, createdAt
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          `member-${organizationId}-${userId}-${Date.now()}`,
          organizationId,
          userId,
          'owner',
          new Date().toISOString()
        ).run()
        
      } catch (orgError) {
        // Handle potential race condition where organization was created by another request
        const existingOrg = await db.prepare(`
          SELECT o.* FROM organization o
          JOIN member m ON o.id = m.organizationId
          WHERE m.userId = ?
          LIMIT 1
        `).bind(userId).first()
        
        if (existingOrg) {
          organizationId = existingOrg.id
        } else {
          throw orgError
        }
      }
    }
    
    // Step 5: Create site record with pending status
    siteId = crypto.randomUUID()
    
    try {
      await db.prepare(`
        INSERT INTO sites (
          id, organization_id, theme_id, name, slug, subdomain, 
          status, plan, onboarding_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        siteId,
        organizationId,
        'saya-theme-v1',
        restaurantName,
        normalizedSubdomain,
        normalizedSubdomain,
        'active',
        'free',
        'pending',
        new Date().toISOString(),
        new Date().toISOString()
      ).run()
    } catch (siteError: any) {
      // Handle unique constraint violation for subdomain
      if (siteError.message?.includes('UNIQUE constraint failed')) {
        return jsonResponse({ 
          error: 'This subdomain is already taken' 
        }, { status: 409 })
      }
      throw siteError
    }
    
    // Step 6: Perform required seeding (must succeed)
    return await performRequiredSeeding(env, db, siteId, organizationId, restaurantName, normalizedSubdomain)
    
  } catch (error) {
    console.error('Site creation failed:', error)
    
    // Mark site as failed if it exists
    try {
      await db.prepare(`
        UPDATE sites SET onboarding_status = 'failed', updated_at = ?
        WHERE id = ?
      `).bind(new Date().toISOString(), siteId).run()
    } catch (updateError) {
      console.error('Failed to mark site as failed:', updateError)
    }
    
    return jsonResponse({ 
      error: 'Failed to create site. Please try again.' 
    }, { status: 500 })
  }
})

// Resume incomplete onboarding
async function resumeOnboarding(env: any, db: any, siteId: string, organizationId: string, restaurantName: string) {
  try {
    return await performRequiredSeeding(env, db, siteId, organizationId, restaurantName, '')
  } catch (error) {
    console.error('Failed to resume onboarding:', error)
    throw error
  }
}

// Perform required seeding (must succeed for onboarding to complete)
async function performRequiredSeeding(env: any, db: any, siteId: string, organizationId: string, restaurantName: string, subdomain: string) {
  const now = new Date().toISOString()
  
  try {
    // Step 1: Seed required Saya theme content (must succeed)
    const contentSeedData = getSayaThemeSeedContent({
      organizationId,
      siteId,
      restaurantName
    })
    
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
    
    // Step 2: Create required default menu (must succeed)
    const menuSeedData = getDefaultMenuSeedData({
      organizationId,
      siteId,
      restaurantName
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
    
    // Insert required menu items (must succeed)
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
    
    const resolvedSubdomain = subdomain || await db.prepare('SELECT subdomain FROM sites WHERE id = ?').bind(siteId).first().then((r: any) => r?.subdomain)
    await createSystemSubdomain(env, db, siteId, organizationId, resolvedSubdomain)

    // Step 3: Mark site as active (onboarding complete)
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'active', updated_at = ?
      WHERE id = ?
    `).bind(now, siteId).run()
    
    return jsonResponse({
      siteId,
      organizationId,
      subdomain: resolvedSubdomain,
      message: 'Site created successfully'
    })
    
  } catch (seedingError) {
    console.error('Required seeding failed:', seedingError)
    
    // Mark site as failed
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'failed', updated_at = ?
      WHERE id = ?
    `).bind(now, siteId).run()
    
    throw new Error('Failed to complete required site setup')
  }
}
