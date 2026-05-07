// Delete a domain from a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const domainId = getRouterParam(event, 'domainId')
  
  if (!siteId || !domainId) {
    return jsonResponse({ 
      error: 'Site ID and domain ID are required' 
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
    // Verify user has access to the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get domain record
    const domain = await db.prepare(`
      SELECT * FROM site_domains 
      WHERE id = ? AND site_id = ?
      LIMIT 1
    `).bind(domainId, siteId).first()
    
    if (!domain) {
      return jsonResponse({ 
        error: 'Domain not found' 
      }, { status: 404 })
    }

    // Don't allow deleting system subdomains
    if (domain.type === 'subdomain') {
      return jsonResponse({ 
        error: 'System subdomains cannot be deleted' 
      }, { status: 400 })
    }

    // Delete the domain
    await db.prepare(`
      DELETE FROM site_domains 
      WHERE id = ? AND site_id = ?
    `).bind(domainId, siteId).run()
    
    return jsonResponse({
      success: true,
      message: 'Domain deleted successfully'
    })
    
  } catch (error) {
    console.error('Failed to delete domain:', error)
    return jsonResponse({ 
      error: 'Failed to delete domain' 
    }, { status: 500 })
  }
})
