// Get billing status for organization
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '../../utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'

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

  const query = getQuery(event)
  const organization = await resolveRequestedOrganization(event, db, session.user.id, {
    explicitOrganizationId: typeof query.organizationId === 'string' ? query.organizationId : null,
  })

  if (!organization) {
    return jsonResponse({ error: 'No organization found' }, { status: 404 })
  }

  try {
    // Get billing status
    const billingStatus = await getOrganizationBillingStatus(env, db, organization.id)

    return jsonResponse({
      success: true,
      billing: { ...billingStatus, organizationId: organization.id },
      userRole: organization.role
    })

  } catch (error) {
    console.error('Failed to get billing status:', error)
    return jsonResponse({
      error: 'Failed to get billing status'
    }, { status: 500 })
  }
})
