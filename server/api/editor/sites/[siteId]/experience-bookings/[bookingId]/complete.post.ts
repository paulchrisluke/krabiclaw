import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { markBookingCompleted } from '~/server/utils/review-requests'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const bookingId = getRouterParam(event, 'bookingId')
  if (!siteId || !bookingId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const booking = await queryFirst<{ id: string; location_id: string; organization_id: string; member_id: string; member_role: string }>(db, `
    SELECT eb.id, eb.location_id, s.organization_id, m.id AS member_id, m.role AS member_role
    FROM experience_bookings eb
    JOIN sites s ON s.id = eb.site_id
    JOIN member m ON m.organizationId = s.organization_id
    WHERE eb.id = ? AND eb.site_id = ? AND m.userId = ?
    LIMIT 1
  `, [bookingId, siteId, session.user.id])
  if (!booking) return jsonResponse({ error: 'Booking not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, {
    memberId: booking.member_id,
    role: booking.member_role,
    organizationId: booking.organization_id,
    siteId,
    resourceLocationId: booking.location_id,
  })

  const completed = await markBookingCompleted(db, 'experience_booking', bookingId, 'manual')
  if (!completed) return jsonResponse({ error: 'Only confirmed bookings can be completed' }, { status: 400 })

  return jsonResponse({ completed: true, booking_id: bookingId })
})
