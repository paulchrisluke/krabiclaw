// Get canonical content for authenticated editor preview
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getEditorContent } from '~/server/utils/mcp-workflows'
import { queryFirst } from '~/server/db'

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
    const site = await queryFirst<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null }>(db, `
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

    const content = await getEditorContent(db, site.organization_id, siteId, page, locationId)

    return jsonResponse({
      success: true,
      ...content,
    })
    
  } catch (error) {
    console.error('Failed to get editor content:', error)
    const statusCode = Number((error as { statusCode?: number }).statusCode) || 500
    const statusMessage = (error as { statusMessage?: string }).statusMessage
    return jsonResponse({ 
      error: statusMessage || 'Failed to get editor content'
    }, { status: statusCode })
  }
})
