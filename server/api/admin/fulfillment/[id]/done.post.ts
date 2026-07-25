// POST /api/admin/fulfillment/[id]/done — mark a service add-on purchase as fulfilled
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute } from '~/server/db'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['fulfillment'] })
  if (permissionDenied) return permissionDenied

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
