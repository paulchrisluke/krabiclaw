import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { markBookingCompleted } from '~/server/utils/review-requests'
import { assertResourceAccess } from '~/server/utils/member-access'
import { getGuestThreadBySubmission, updateThreadProjection } from '~/server/domain/guest-threads/repository'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  const submission = await queryFirst<{ id: string; location_id: string }>(db, `
    SELECT rs.id, rs.location_id
    FROM reservation_submissions rs
    WHERE rs.id = ? AND rs.site_id = ?
    LIMIT 1
  `, [submissionId, siteId])
  if (!submission) return jsonResponse({ error: 'Reservation not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: submission.location_id, })

  const completed = await markBookingCompleted(db, 'reservation', submissionId, 'manual')
  if (!completed) return jsonResponse({ error: 'Reservation could not be completed' }, { status: 400 })
  const thread = await getGuestThreadBySubmission(db, 'reservation', submissionId)
  if (thread) {
    await updateThreadProjection(db, thread.id, {})
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
  }

  return jsonResponse({ completed: true, submission_id: submissionId })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
