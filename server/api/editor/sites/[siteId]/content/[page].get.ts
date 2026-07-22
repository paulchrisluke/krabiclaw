// Get canonical content for authenticated editor preview
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getEditorContent } from '~/server/utils/mcp-workflows'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

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
    const site = await loadMemberSiteRow(db, siteId, session.user.id)

    if (!site) {
      return jsonResponse({
        error: 'Site not found or access denied'
      }, { status: 404 })
    }

    // No locationId means the site-wide pages (home/about/contact); a
    // location-scoped editor must pass their own location's id explicitly.
    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: locationId ?? null,
    })

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
