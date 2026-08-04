// Get consolidated billing status for all of the user's organizations
import { apiErrorResponse, cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getUserBillingItems } from '../../utils/billing'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return apiErrorResponse(event, 500, 'DATABASE_UNAVAILABLE', 'Database not available')
  }

  const session = await getAuthSession(event, env)

  if (!session?.user?.id) {
    return apiErrorResponse(event, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required')
  }

  try {
    const billingItems = await getUserBillingItems(env, db, session.user.id)

    return jsonResponse({
      success: true,
      items: billingItems
    })

  } catch (error) {
    console.error('Failed to fetch user billing items:', error)
    return apiErrorResponse(event, 502, 'BILLING_ITEMS_LOAD_FAILED', 'Billing items could not be loaded')
  }
})
