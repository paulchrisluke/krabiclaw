// DELETE /api/editor/sites/[siteId]/locations/[locationId]/qa/[qaId]
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const qaId = getRouterParam(event, 'qaId')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  await db.prepare(
    `DELETE FROM location_qa WHERE id = ? AND location_id = ? AND site_id = ?`
  ).bind(qaId, locationId, siteId).run()

  return jsonResponse({ deleted: true })
})
