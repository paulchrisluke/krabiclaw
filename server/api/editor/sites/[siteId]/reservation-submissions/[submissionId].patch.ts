// PATCH /api/editor/sites/[siteId]/reservation-submissions/[submissionId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const body = await readBody(event) as ApiRecord
  const status = cleanString(body.status, 20)
  if (!['new', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return jsonResponse({ error: 'Invalid status' }, { status: 400 })
  }

  const result = await db.prepare(`
    UPDATE reservation_submissions
    SET status = ?
    WHERE id = ? AND site_id = ?
  `).bind(status, submissionId, siteId).run()

  if (!result.meta.changes) return jsonResponse({ error: 'Reservation not found' }, { status: 404 })
  return jsonResponse({ updated: true })
})
