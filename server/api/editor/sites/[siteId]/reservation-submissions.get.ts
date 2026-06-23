// GET /api/editor/sites/[siteId]/reservation-submissions
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listReservationSubmissions } from '~/server/utils/mcp-workflows'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst(
    db,
    `SELECT s.organization_id FROM sites s JOIN member m ON s.organization_id = m.organizationId
     WHERE s.id = ? AND m.userId = ? LIMIT 1`,
    [siteId, session.user.id],
  )
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const submissions = await listReservationSubmissions(db, siteId)
  return jsonResponse({ submissions })
})
