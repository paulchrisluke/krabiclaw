// Get consolidated billing status for all of the user's organizations
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '../../utils/billing'
import { queryAll } from '~/server/db'

export default defineEventHandler(async (event) => {
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
    // 1. Fetch all organizations the user belongs to
    const orgRows = await queryAll<{ id: string, name: string, logo: string | null, createdAt: number, role: string }>(db, `
      SELECT o.id, o.name, o.logo, o.createdAt, m.role
      FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY o.createdAt ASC
    `, [session.user.id])
    const organizations = orgRows.map(org => ({
      ...org,
      createdAt: new Date(org.createdAt * 1000).toISOString()
    }))

    if (!organizations || organizations.length === 0) {
      return jsonResponse({
        success: true,
        items: []
      })
    }

    // 2. Fetch billing status for each organization server-side (avoiding frontend N+1)
    const billingItems = await Promise.all(
      organizations.map(async (org) => {
        try {
          const billingStatus = await getOrganizationBillingStatus(env, db, org.id)
          return {
            organization: org,
            billing: { ...billingStatus, organizationId: org.id },
            userRole: org.role
          }
        } catch (error) {
          console.error(`Failed to get billing status for org ${org.id}:`, error)
          // Fallback if Stripe or DB fails for a single org
          return {
            organization: org,
            billing: { plan: 'free', subscriptionStatus: 'active', organizationId: org.id },
            userRole: org.role
          }
        }
      })
    )
    
    return jsonResponse({
      success: true,
      items: billingItems
    })
    
  } catch (error) {
    console.error('Failed to fetch user billing items:', error)
    return jsonResponse({ 
      error: 'Failed to fetch billing items' 
    }, { status: 500 })
  }
})
