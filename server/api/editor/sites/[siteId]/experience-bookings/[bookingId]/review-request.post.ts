import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { sendReviewRequestForBooking } from '~/server/utils/review-request-delivery'
import { assertResourceAccess } from '~/server/utils/member-access'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const bookingId = getRouterParam(event, 'bookingId')
  if (!siteId || !bookingId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  const booking = await queryFirst<{ id: string; location_id: string }>(db, `
    SELECT eb.id, eb.location_id
    FROM experience_bookings eb
    WHERE eb.id = ? AND eb.site_id = ?
    LIMIT 1
  `, [bookingId, siteId])
  if (!booking) return jsonResponse({ error: 'Booking not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: booking.location_id, })

  const body = await readBody(event).catch(() => ({})) as { kind?: string }
  const kind = body.kind === 'reminder' ? 'reminder' : 'first'
  const result = await sendReviewRequestForBooking(env, db, 'experience_booking', bookingId, kind)

  return jsonResponse(result, { status: result.sent ? 200 : 502 })
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
