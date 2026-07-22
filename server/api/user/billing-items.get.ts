// Get consolidated billing status for all of the user's organizations
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getUserBillingItems } from '../../utils/billing'

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

  try {
    const billingItems = await getUserBillingItems(env, db, session.user.id)

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
