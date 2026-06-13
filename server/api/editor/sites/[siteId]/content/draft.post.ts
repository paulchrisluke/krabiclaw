// POST save draft
import { cloudflareEnv, jsonResponse } from '../../../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { saveContentDraft } from '~/server/utils/mcp-workflows'

interface DraftRequest {
  page: string
  changes: Record<string, string>
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as DraftRequest
  const { page, changes } = body
  
  if (!siteId || !page || !changes) {
    return jsonResponse({ 
      error: 'Site ID, page, and changes are required' 
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
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.status, s.onboarding_status
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    const locationId = getQuery(event).locationId as string || undefined
    const result = await saveContentDraft(db, site.organization_id, siteId, session.user.id, {
      page,
      changes,
      location_id: locationId,
    })
    
    return jsonResponse({
      success: true,
      message: 'Draft saved successfully',
      changesCount: result.changes_count,
    })
    
  } catch (error) {
    console.error('Failed to save draft:', error)
    return jsonResponse({ 
      error: 'Failed to save draft' 
    }, { status: 500 })
  }
})
