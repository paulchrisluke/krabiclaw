// Get published content for public tenant rendering (no auth required)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPageContent, getDraftContent } from '~/server/utils/content-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const page = getRouterParam(event, 'page')
  const locationSlug = getQuery(event).location as string || undefined
  
  // Initialize env first
  const env = cloudflareEnv(event)
  
  // Explicit preview authorization check with proper validation
  const preview = getQuery(event).preview === 'true'
  const previewToken = getQuery(event).token as string || undefined
  
  // Ensure PREVIEW_SECRET exists and use constant-time comparison
  let isPreviewAuthorized = false
  if (preview && previewToken) {
    const previewSecret = env.PREVIEW_SECRET
    if (!previewSecret) {
      return jsonResponse({ 
        error: 'Preview not configured' 
      }, { status: 500 })
    }
    
    // Use constant-time comparison to prevent timing attacks
    try {
      const crypto = require('crypto')
      const secretBuffer = Buffer.from(previewSecret, 'utf8')
      const tokenBuffer = Buffer.from(previewToken, 'utf8')
      
      if (secretBuffer.length === tokenBuffer.length) {
        isPreviewAuthorized = crypto.timingSafeEqual(secretBuffer, tokenBuffer)
      }
    } catch (error) {
      // If crypto comparison fails, deny access
      isPreviewAuthorized = false
    }
  }
  
  if (preview && !isPreviewAuthorized) {
    return jsonResponse({ 
      error: 'Unauthorized preview access' 
    }, { status: 401 })
  }
  
  if (!siteId || !page) {
    return jsonResponse({ 
      error: 'Site ID and page are required' 
    }, { status: 400 })
  }
  
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Get site info (public access)
    const site = await db.prepare(`
      SELECT id, organization_id, status, onboarding_status 
      FROM sites 
      WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
      LIMIT 1
    `).bind(siteId).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or not active' 
      }, { status: 404 })
    }

    // Find location by slug if provided
    let locationId = null
    if (locationSlug) {
      const location = await db.prepare(`
        SELECT id FROM business_locations 
        WHERE site_id = ? AND slug = ? AND status = 'active'
        LIMIT 1
      `).bind(siteId, locationSlug).first()
      
      if (location) {
        locationId = location.id
      }
    }

    // Get published content
    const publishedContent = await getPageContent(db, site.organization_id, siteId, page, locationId)
    
    // In preview mode, also fetch and merge drafts
    let content = publishedContent
    if (isPreviewAuthorized) {
      const drafts = await getDraftContent(db, site.organization_id, siteId, page, locationId)
      content = [...publishedContent]
      for (const draft of drafts) {
        const index = content.findIndex(c => c.field === draft.field)
        if (index !== -1) {
          content[index] = { ...content[index], ...draft }
        } else {
          content.push(draft)
        }
      }
    }
    
    return jsonResponse({
      success: true,
      content,
      siteId,
      locationId,
      page,
      preview
    })
    
  } catch (error) {
    console.error('Failed to get public content:', error)
    return jsonResponse({ 
      error: 'Failed to get content' 
    }, { status: 500 })
  }
})
