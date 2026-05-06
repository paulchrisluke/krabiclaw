import { defineEventHandler, readBody, getHeaders } from 'h3'
import { publishDrafts } from '~/server/utils/content-management'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 503 })
  }

  // Get authenticated user
  const auth = createAuth(env)
  const session = await auth.api.getSession({
    headers: getHeaders(event)
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    const body = await readBody(event)
    const { path, site_id } = body

    if (!path || !site_id) {
      return jsonResponse({ 
        error: 'Path and site_id are required' 
      }, { status: 400 })
    }

    // Verify user owns this site
    const site = await db.prepare(`
      SELECT id, organization_id FROM sites 
      WHERE id = ? LIMIT 1
    `).bind(site_id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found' 
      }, { status: 404 })
    }

    const membership = await db.prepare(`
      SELECT 1 FROM member m
      WHERE m.organizationId = ? AND m.userId = ?
      LIMIT 1
    `).bind(site.organization_id, session.user.id).first()
    
    if (!membership) {
      return jsonResponse({ 
        error: 'Access denied' 
      }, { status: 403 })
    }

    // Convert page path to page identifier
    const page = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-')

    // Publish drafts for this page
    await publishDrafts(db, site.organization_id, site_id, page)

    return jsonResponse({
      success: true,
      message: 'Content published successfully'
    })

  } catch (error) {
    console.error('Failed to publish content:', error)
    return jsonResponse({ 
      error: 'Failed to publish content' 
    }, { status: 500 })
  }
})
