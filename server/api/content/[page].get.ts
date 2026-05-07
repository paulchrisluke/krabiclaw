import { defineEventHandler, setHeader, getRouterParam, getQuery, getHeaders, getRequestURL } from 'h3'
import { getPageContent, getDraftContent } from '~/server/utils/content-management'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  
  const page = getRouterParam(event, 'page')
  const siteId = getRouterParam(event, 'siteId') || getQuery(event).siteId as string
  
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

  // Get authenticated user from existing session
  const auth = createAuth(env)
  const session = await auth.api.getSession({
    headers: getHeaders(event)
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  // Verify user belongs to organization that owns the site
  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member om ON o.id = om.organizationId
    WHERE s.id = ? AND om.userId = ?
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
