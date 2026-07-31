import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { reconcileDueDomains } from '~/server/utils/domains'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['domains'] })
  if (permissionDenied) return permissionDenied

  try {
    const result = await reconcileDueDomains(env, db, 100)
    return jsonResponse({ success: true, data: result })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Failed to reconcile domains')
    console.error('admin_domain_reconcile_failed', {
      error: normalizedError.message
    })
    return jsonResponse({ error: normalizedError.message || 'Failed to reconcile domains' }, { status: 500 })
  }
})
