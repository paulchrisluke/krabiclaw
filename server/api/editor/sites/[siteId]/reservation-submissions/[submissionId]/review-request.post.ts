import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { sendReviewRequestForBooking } from '~/server/utils/review-request-delivery'
import { assertResourceAccess } from '~/server/utils/member-access'
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

  const body = await readBody(event).catch(() => ({})) as { kind?: string }
  const kind = body.kind === 'reminder' ? 'reminder' : 'first'
  const result = await sendReviewRequestForBooking(env, db, 'reservation', submissionId, kind)

  return jsonResponse(result, { status: result.sent ? 200 : 502 })
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
