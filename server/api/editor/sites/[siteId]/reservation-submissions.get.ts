// GET /api/editor/sites/[siteId]/reservation-submissions
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(
    `SELECT s.organization_id FROM sites s JOIN member m ON s.organization_id = m.organizationId
     WHERE s.id = ? AND m.userId = ? LIMIT 1`
  ).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const { results } = await db.prepare(
    `SELECT * FROM reservation_submissions WHERE site_id = ? ORDER BY created_at DESC LIMIT 200`
  ).bind(siteId).all()

  return jsonResponse({ submissions: results ?? [] })
})
