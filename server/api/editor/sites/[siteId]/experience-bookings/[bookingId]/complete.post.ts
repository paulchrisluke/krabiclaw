import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { executeGuestThreadOperation } from '~/server/domain/guest-threads/operations'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const bookingId = getRouterParam(event, 'bookingId')
  if (!siteId || !bookingId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Booking not found or access denied' }, { status: 404 })

  const booking = await queryFirst<{ id: string; location_id: string }>(db, `
    SELECT id, location_id FROM requests
    WHERE kind = 'booking' AND id = ? AND site_id = ?
    LIMIT 1
  `, [bookingId, siteId])
  if (!booking) return jsonResponse({ error: 'Booking not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: booking.location_id, })

  const outcome = await executeGuestThreadOperation(db, { threadId: bookingId, siteId, action: 'complete', actorUserId: session.user.id, env, idempotencyKey: `manual-complete:${bookingId}` })
  if (!outcome.ok) return jsonResponse({ error: 'message' in outcome ? outcome.message : outcome.reason }, { status: outcome.status })
  await publishGuestInboxThreadEvent(env, db, { threadId: bookingId, type: 'thread.changed' })

  return jsonResponse({ completed: true, booking_id: bookingId })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
