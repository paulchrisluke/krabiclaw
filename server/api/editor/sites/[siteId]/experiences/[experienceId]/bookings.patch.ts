import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { updateBookingStatus } from '~/server/utils/experiences'
import { assertResourceAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'
import { getGuestThreadBySubmission, updateThreadProjection } from '~/server/domain/guest-threads/repository'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

  const experience = await queryFirst<{ location_id: string }>(db, `SELECT location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1`, [experienceId, siteId])
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: experience.location_id, })

  let body: { booking_id?: string; status?: string }
  try { body = await readRequiredBody<{ booking_id?: string; status?: string }>(event) } catch { return jsonResponse({ error: 'Invalid body' }, { status: 400 }) }
  if (!body.booking_id || !['pending', 'confirmed', 'cancelled'].includes(body.status ?? '')) {
    return jsonResponse({ error: 'booking_id and valid status required' }, { status: 400 })
  }

  const ok = await updateBookingStatus(db, siteId, experienceId, body.booking_id, body.status as 'pending' | 'confirmed' | 'cancelled')
  if (!ok) return jsonResponse({ error: 'Booking not found' }, { status: 404 })
  const thread = await getGuestThreadBySubmission(db, 'experience_booking', body.booking_id)
  if (thread) {
    await updateThreadProjection(db, thread.id, {})
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
  }
  return jsonResponse({ updated: true })
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
