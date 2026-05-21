// GET /api/editor/sites/[siteId]/locations/[locationId]/qa
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const { results } = await db.prepare(
    `SELECT * FROM location_qa WHERE location_id = ? AND site_id = ?
     ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`
  ).bind(locationId, siteId).all()

  return jsonResponse({ qa: results ?? [] })
})
