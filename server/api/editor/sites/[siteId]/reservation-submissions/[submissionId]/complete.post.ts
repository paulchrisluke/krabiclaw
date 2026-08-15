import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { markBookingCompleted } from '~/server/utils/review-requests'
import { assertResourceAccess } from '~/server/utils/member-access'
import { getGuestThreadBySubmission, updateThreadProjection } from '~/server/domain/guest-threads/repository'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const submission = await queryFirst<{ id: string; location_id: string; organization_id: string; member_id: string; member_role: string }>(db, `
    SELECT rs.id, rs.location_id, s.organization_id, m.id AS member_id, m.role AS member_role
    FROM reservation_submissions rs
    JOIN sites s ON s.id = rs.site_id
    JOIN member m ON m.organizationId = s.organization_id
    WHERE rs.id = ? AND rs.site_id = ? AND m.userId = ?
    LIMIT 1
  `, [submissionId, siteId, session.user.id])
  if (!submission) return jsonResponse({ error: 'Reservation not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, {
    memberId: submission.member_id,
    role: submission.member_role,
    organizationId: submission.organization_id,
    siteId,
    resourceLocationId: submission.location_id,
  })

  const completed = await markBookingCompleted(db, 'reservation', submissionId, 'manual')
  if (!completed) return jsonResponse({ error: 'Reservation could not be completed' }, { status: 400 })
  const thread = await getGuestThreadBySubmission(db, 'reservation', submissionId)
  if (thread) {
    await updateThreadProjection(db, thread.id, {})
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
  }

  return jsonResponse({ completed: true, submission_id: submissionId })
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
