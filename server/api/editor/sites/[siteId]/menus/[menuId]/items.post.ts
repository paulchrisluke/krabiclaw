// POST create menu item
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createMenuItem } from '~/server/utils/menu-management'
import { normalizePriceAmount } from '~/shared/money'
import type { CreateMenuItemRequest } from '~/server/types/menu'

export default defineEventHandler(async (event) => {
  const rawSiteId = getRouterParam(event, 'siteId')
  const rawMenuId = getRouterParam(event, 'menuId')
  const siteId = typeof rawSiteId === 'string' ? rawSiteId : null
  const menuId = typeof rawMenuId === 'string' ? rawMenuId : null
  const body = await readBody(event) as CreateMenuItemRequest
  
  if (!siteId || !menuId || !body.name || !body.section) {
    return jsonResponse({ 
      error: 'Site ID, menu ID, item name, and section are required' 
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
    const site = await queryFirst<{ id: string; organization_id: string }>(db, `
      SELECT s.id, s.organization_id, s.status, s.onboarding_status
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `, [siteId, session.user.id])

    if (!site) {
      return jsonResponse({
        error: 'Site not found or access denied'
      }, { status: 404 })
    }

    // Check if menu exists and belongs to this site
    const existingMenu = await queryFirst(db, `
      SELECT id FROM menus
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `, [menuId, site.organization_id, siteId])

    if (!existingMenu) {
      return jsonResponse({
        error: 'Menu not found'
      }, { status: 404 })
    }

    if (body.image_asset_id !== undefined && body.image_asset_id !== null && body.image_asset_id !== '') {
      const asset = await queryFirst(db, `
        SELECT id
        FROM media_assets
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `, [body.image_asset_id, site.organization_id, siteId])

      if (!asset) {
        return jsonResponse({ error: 'Invalid image_asset_id' }, { status: 400 })
      }
    }

    if (body.price_amount !== undefined && body.price_amount !== null && String(body.price_amount).trim() !== '' && !normalizePriceAmount(body.price_amount)) {
      return jsonResponse({ error: 'Invalid price amount' }, { status: 400 })
    }

    if (body.compare_at_price_amount !== undefined && body.compare_at_price_amount !== null && String(body.compare_at_price_amount).trim() !== '' && !normalizePriceAmount(body.compare_at_price_amount)) {
      return jsonResponse({ error: 'Invalid compare-at price amount' }, { status: 400 })
    }

    const menuItem = await createMenuItem(db, site.organization_id, siteId, menuId, body, session.user.id)
    
    return jsonResponse({
      success: true,
      menuItem,
      siteId,
      menuId
    }, { status: 201 })
    
  } catch (error) {
    console.error('Failed to create menu item:', error)
    return jsonResponse({ 
      error: 'Failed to create menu item' 
    }, { status: 500 })
  }
})
