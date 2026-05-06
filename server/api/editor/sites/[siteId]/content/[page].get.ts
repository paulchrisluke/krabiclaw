// Get draft + published merged content for authenticated editor preview
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPageContent, getDraftContent } from '~/server/utils/content-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const page = getRouterParam(event, 'page')
  const locationId = getQuery(event).locationId as string || undefined
  
  if (!siteId || !page) {
    return jsonResponse({ 
      error: 'Site ID and page are required' 
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
    // Verify user belongs to organization that owns the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.name, s.status, s.onboarding_status
      FROM sites s
      JOIN organizations o ON s.organization_id = o.id
      JOIN organization_members om ON o.id = om.organization_id
      WHERE s.id = ? AND om.user_id = ? AND om.role = 'owner'
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get published content
    const publishedContent = await getPageContent(db, site.organization_id, siteId, page, locationId)
    
    // Get draft content
    const drafts = await getDraftContent(db, site.organization_id, siteId, page, locationId)
    
    // Merge drafts over published content
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
      locationId,
      page
    })
    
  } catch (error) {
    console.error('Failed to get editor content:', error)
    return jsonResponse({ 
      error: 'Failed to get editor content' 
    }, { status: 500 })
  }
})
