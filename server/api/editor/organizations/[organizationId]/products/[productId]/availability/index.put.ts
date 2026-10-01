import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess, requireOrganizationAccess } from '~/server/utils/location-access'
import { replaceWeeklySchedule } from '~/server/utils/availability'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Replace the weekly schedule a product runs at one location.
 *
 * The body is the whole schedule for that branch: every (weekday, time) the
 * merchant runs, using the Product's duration and capacity.
 * Times are the branch's wall clock; the branch's timezone is what makes them
 * instants. See replaceWeeklySchedule for what a removed slot does to the
 * sessions already generated from it.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const productId = getRouterParam(event, 'productId')
  if (!organizationId || !productId) return jsonResponse({ error: 'Organization ID and product ID are required' }, { status: 400 })
  try {
    const body = await readStrictBody<{ location_id: unknown; slots: unknown }>(event, { location_id: 'unknown', slots: 'unknown' })
    if (body.location_id !== null && (typeof body.location_id !== 'string' || !body.location_id)) return jsonResponse({ error: 'location_id must be a location ID or explicit null for online sessions' }, { status: 400 })
    const { db, session, organization } = await (body.location_id === null ? requireOrganizationAccess(event, organizationId) : requireLocationAccess(event, organizationId, body.location_id))
    const result = await replaceWeeklySchedule(db, {
      organizationId: organization.id, productId, locationId: body.location_id,
      slots: body.slots, actorId: session.user.id,
    })
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    rethrowHttpError(error)
    console.error('availability_replace_failed', { organizationId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to save the schedule' }, { status: 500 })
  }
})
