// PATCH /api/editor/sites/[siteId]/experience-bookings/[bookingId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateBookingStatusForSite } from '~/server/utils/experiences'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { queryFirst } from '~/server/db'

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
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const booking = await queryFirst<{ location_id: string }>(db, `SELECT location_id FROM experience_bookings WHERE id = ? AND site_id = ? LIMIT 1`, [bookingId, siteId])
  if (!booking) return jsonResponse({ error: 'Booking not found' }, { status: 404 })

  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: booking.location_id,
  })

  const body = await readBody(event) as { status?: unknown }
  const status = cleanString(body.status, 20)
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
    return jsonResponse({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = await updateBookingStatusForSite(db, siteId, bookingId, status as 'pending' | 'confirmed' | 'cancelled')
  if (!updated) return jsonResponse({ error: 'Booking not found' }, { status: 404 })

  return jsonResponse({ updated: true })
})
