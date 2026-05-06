// POST discard draft
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { discardDrafts } from '~/server/utils/content-management'

interface DiscardRequest {
  page: string
  all?: boolean
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as DiscardRequest
  const { page, all } = body
  
  if (!siteId || (!page && !all)) {
    return jsonResponse({ 
      error: 'Site ID and page (or all flag) are required' 
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
    // Verify user belongs to organization that owns this site (owner/dashboard/editor for discard)
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.name, s.status, s.onboarding_status
      FROM sites s
      JOIN organizations o ON s.organization_id = o.id
      JOIN organization_members om ON o.id = om.organization_id
      WHERE s.id = ? AND om.user_id = ? AND om.role IN ('owner', 'dashboard', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    const locationId = getQuery(event).locationId as string || undefined

    if (all) {
      // Discard all drafts for this site  
      await discardAllDrafts(db)
      
      return jsonResponse({
        success: true,
        message: 'All drafts discarded',
        scope: 'all'
      })
    } else {
      // Discard specific page
      await discardDrafts(db, site.organization_id, siteId, page, locationId)
      
      return jsonResponse({
        success: true,
        message: 'Drafts discarded',
        page,
        locationId
      })
    }
    
  } catch (error) {
    console.error('Failed to discard drafts:', error)
    return jsonResponse({ 
      error: 'Failed to discard drafts' 
    }, { status: 500 })
  }
})
