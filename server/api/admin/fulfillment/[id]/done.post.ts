// POST /api/admin/fulfillment/[id]/done — mark a service add-on purchase as fulfilled
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { execute } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const id = getRouterParam(event, 'id')
  if (!id) return jsonResponse({ error: 'Purchase ID required' }, { status: 400 })

  const result = await execute(db, `
    UPDATE service_addon_purchases
    SET fulfilled_at = ?
    WHERE id = ? AND fulfilled_at IS NULL
  `, [new Date().toISOString(), id])

  if (result.meta.changes === 0) {
    return jsonResponse({ error: 'Purchase not found or already fulfilled' }, { status: 404 })
  }

  return jsonResponse({ success: true })
})
