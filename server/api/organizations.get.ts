// The organizations the authenticated user belongs to.
import { cloudflareEnv, jsonResponse } from '../utils/api-response'
import { getAuthSession } from '../utils/auth'
import { DEMO_ORG_ID } from '../utils/demo'
import { defineHandler } from 'nitro';
import { queryAll } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { listUserOrganizations } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
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
    const organization = await listUserOrganizations(env, userId)

    if (!organization || organization.length === 0) {
      return jsonResponse({
        organizations: []
      })
    }

    const allOrgIds = organization.map((org: ApiValue) => org.id)
    // Non-admins must never see or access the demo site
    const orgIds = isPlatformAdmin ? allOrgIds : allOrgIds.filter((id: ApiValue) => id !== DEMO_ORG_ID)

    if (orgIds.length === 0) {
      return jsonResponse({ organizations: [] })
    }

    const organizations = await queryAll(db, `
      SELECT id, theme_id, name, slug, subdomain,
             (SELECT domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, status, "createdAt" AS created_at, updated_at,
             onboarding_status
      FROM organization
      WHERE id IN (SELECT value FROM json_each(?))
      ORDER BY "createdAt" DESC
    `, [d1JsonStringSet(orgIds)])

    const results = (organizations || []).map((organization: ApiValue) => ({
      ...organization as object,
      is_demo: (organization as { id: string }).id === DEMO_ORG_ID,
    }))

    return jsonResponse({
      organizations: results
    })
    
  } catch (error) {
    console.error('Failed to fetch organizations:', error)
    return jsonResponse({ 
      error: 'Failed to fetch organizations' 
    }, { status: 500 })
  }
})
