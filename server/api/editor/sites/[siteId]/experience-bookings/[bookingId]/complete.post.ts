import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { markBookingCompleted } from '~/server/utils/review-requests'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const bookingId = getRouterParam(event, 'bookingId')
  if (!siteId || !bookingId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Booking not found or access denied' }, { status: 404 })

  const booking = await queryFirst<{ id: string; location_id: string }>(db, `
    SELECT id, location_id FROM experience_bookings
    WHERE id = ? AND site_id = ?
    LIMIT 1
  `, [bookingId, siteId])
  if (!booking) return jsonResponse({ error: 'Booking not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: booking.location_id,
  })

  const completed = await markBookingCompleted(db, 'experience_booking', bookingId, 'manual')
  if (!completed) return jsonResponse({ error: 'Only confirmed bookings can be completed' }, { status: 400 })

  return jsonResponse({ completed: true, booking_id: bookingId })
})
