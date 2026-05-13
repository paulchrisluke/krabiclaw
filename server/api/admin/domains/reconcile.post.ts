import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { reconcileDueDomains } from '~/server/utils/domains'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  try {
    const result = await reconcileDueDomains(env, db, 100)
    return jsonResponse({ success: true, data: result })
  } catch (error: any) {
    console.error('admin_domain_reconcile_failed', {
      userId: session.user.id,
      error: error?.message || 'Unknown error'
    })
    return jsonResponse({ error: error?.message || 'Failed to reconcile domains' }, { status: 500 })
  }
})
