import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { markBookingCompleted } from '~/server/utils/review-requests'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const submission = await queryFirst<{ id: string }>(db, `
    SELECT rs.id
    FROM reservation_submissions rs
    JOIN sites s ON s.id = rs.site_id
    JOIN member m ON m.organizationId = s.organization_id
    WHERE rs.id = ? AND rs.site_id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `, [submissionId, siteId, session.user.id])
  if (!submission) return jsonResponse({ error: 'Reservation not found or access denied' }, { status: 404 })

  const completed = await markBookingCompleted(db, 'reservation', submissionId, 'manual')
  if (!completed) return jsonResponse({ error: 'Reservation could not be completed' }, { status: 400 })

  return jsonResponse({ completed: true, submission_id: submissionId })
})
