// Retry onboarding for failed/incomplete sites
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { seedNewSite } from '../../utils/site-template'

interface RetrySiteRequest {
  siteId: string
}

interface RetrySiteRow {
  id: string
  organization_id: string
  organization_name: string
  onboarding_status: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RetrySiteRequest>(event)
  if (!body || typeof body !== 'object') {
    return jsonResponse({
      error: 'Site ID is required'
    }, { status: 400 })
  }
  const { siteId } = body
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }
  
  // Get authenticated user from Better Auth session
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }
  
  try {
    // Get site details and verify ownership
    const site = await db.prepare(`
      SELECT s.*, o.name as organization_name FROM sites s
      JOIN organization o ON s.organization_id = o.id
      WHERE s.id = ? AND o.id IN (
        SELECT organizationId FROM member WHERE userId = ?
      )
      LIMIT 1
    `).bind(siteId, session.user.id).first<RetrySiteRow>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }
    
    // Only retry if site is in pending/failed state
    if (site.onboarding_status === 'active') {
      return jsonResponse({
        message: 'Site setup is already complete',
        site
      })
    }
    
    // Mark site as pending (retrying)
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'pending', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), siteId).run()
    
    // Perform required seeding
    await seedNewSite(db, { organizationId: site.organization_id, siteId, restaurantName: site.organization_name })
    
    // Mark site as active (success)
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'active', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), siteId).run()
    
    return jsonResponse({
      message: 'Site setup completed successfully',
      siteId,
      onboarding_status: 'active'
    })
    
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('Retry onboarding failed:', normalizedError)
    
    // Mark site as failed
    await db.prepare(`
      UPDATE sites SET onboarding_status = 'failed', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), siteId).run()
    
    return jsonResponse({ 
      error: 'Failed to complete site setup' 
    }, { status: 500 })
  }
})
