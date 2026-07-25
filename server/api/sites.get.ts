// Get sites for authenticated user's organization
import { cloudflareEnv, jsonResponse } from '../utils/api-response'
import { getAuthSession } from '../utils/auth'
import { DEMO_ORG_ID } from '../utils/demo'
import { defineEventHandler } from 'h3'
import { queryAll } from '~/server/db'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }
  
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }
  
  const userId = session.user.id
  const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })

  try {
    // Get user's organization
    const organization = await queryAll(db, `
      SELECT o.id FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
    `, [userId])

    if (!organization || organization.length === 0) {
      return jsonResponse({
        sites: []
      })
    }

    const allOrgIds = organization.map((org: ApiValue) => org.id)
    // Non-admins must never see or access the demo site
    const orgIds = isPlatformAdmin ? allOrgIds : allOrgIds.filter((id: ApiValue) => id !== DEMO_ORG_ID)

    if (orgIds.length === 0) {
      return jsonResponse({ sites: [] })
    }

    // Build WHERE clause for multiple organization IDs
    const placeholders = orgIds.map(() => '?').join(',')
    const sites = await queryAll(db, `
      SELECT id, organization_id, theme_id, brand_name, slug, subdomain,
             custom_domain, status, plan, created_at, updated_at,
             onboarding_status
      FROM sites
      WHERE organization_id IN (${placeholders})
      ORDER BY created_at DESC
    `, orgIds)

    const results = (sites || []).map((site: ApiValue) => ({
      ...site as object,
      is_demo: (site as { organization_id: string }).organization_id === DEMO_ORG_ID,
    }))

    return jsonResponse({
      sites: results
    })
    
  } catch (error) {
    console.error('Failed to fetch sites:', error)
    return jsonResponse({ 
      error: 'Failed to fetch sites' 
    }, { status: 500 })
  }
})
