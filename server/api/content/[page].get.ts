import { defineEventHandler } from 'h3'
import { getPageContent, getDraftContent } from '~/server/utils/content-management'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  
  const page = getRouterParam(event, 'page')
  const siteId = getRouterParam(event, 'siteId')
  
  if (!page || !siteId) {
    return jsonResponse({ 
      error: 'Page and site ID are required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 503 })
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

  // Verify user belongs to organization that owns the site
  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organizations o ON s.organization_id = o.id
    JOIN organization_members om ON o.id = om.organization_id
    WHERE s.id = ? AND om.user_id = ?
    LIMIT 1
  `).bind(siteId, session.user.id).first()
  
  if (!site) {
    return jsonResponse({ 
      error: 'Site not found or access denied' 
    }, { status: 404 })
  }

  const locationId = getQuery(event).location_id as string || undefined

  try {
    const publishedContent = await getPageContent(db, site.organization_id, siteId, page, locationId)
    const drafts = await getDraftContent(db, site.organization_id, siteId, page, locationId)
    
    const mergedContent = [...publishedContent]
    for (const draft of drafts) {
      const index = mergedContent.findIndex(c => c.field === draft.field)
      if (index !== -1) {
        mergedContent[index] = { ...mergedContent[index], ...draft }
      } else {
        mergedContent.push(draft)
      }
    }
    
    return jsonResponse({
      success: true,
      content: mergedContent,
      hasDrafts: drafts.length > 0,
      siteId,
      locationId
    })
    
  } catch (error) {
    console.error('Failed to get page content:', error)
    return jsonResponse({ 
      error: 'Failed to get page content' 
    }, { status: 500 })
  }
})
