import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { requireSiteProduct } from '~/server/utils/product-management'
import { replaceWeeklySchedule, type WeeklySlotInput } from '~/server/utils/availability'
import { queryFirst } from '~/server/db'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Replace the weekly schedule a product runs at one location.
 *
 * The body is the whole schedule for that branch: every (weekday, time) the
 * merchant runs, each with its own places or null for the product's default.
 * Times are the branch's wall clock; the branch's timezone is what makes them
 * instants. See replaceWeeklySchedule for what a removed slot does to the
 * sessions already generated from it.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const body = await readStrictBody<{ location_id: unknown; slots: unknown }>(event, { location_id: 'unknown', slots: 'unknown' })
    if (typeof body.location_id !== 'string' || !body.location_id) return jsonResponse({ error: 'location_id is required' }, { status: 400 })
    if (!Array.isArray(body.slots)) return jsonResponse({ error: 'slots must be an array' }, { status: 400 })
    const slots: WeeklySlotInput[] = []
    for (const entry of body.slots) {
      if (typeof entry !== 'object' || entry === null) return jsonResponse({ error: 'each slot must be an object' }, { status: 400 })
      const slot = entry as Record<string, unknown>
      if (typeof slot.weekday !== 'number' || typeof slot.start_time !== 'string') return jsonResponse({ error: 'each slot needs a weekday and a start_time' }, { status: 400 })
      if (slot.capacity !== null && slot.capacity !== undefined && typeof slot.capacity !== 'number') return jsonResponse({ error: 'capacity must be a number or null' }, { status: 400 })
      slots.push({ weekday: slot.weekday, start_time: slot.start_time, capacity: slot.capacity === undefined ? null : slot.capacity as number | null })
    }
    const { db, session, site } = await requireLocationAccess(event, siteId, body.location_id)
    // A product id in the path is not authorized by the site in the path.
    await requireSiteProduct(db, { organizationId: site.organization_id, siteId, productId })
    const location = await queryFirst<{ timezone: string | null }>(db, 'SELECT timezone FROM business_locations WHERE organization_id = ? AND site_id = ? AND id = ?', [site.organization_id, siteId, body.location_id])
    if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })
    if (!location.timezone) return jsonResponse({ error: 'Set the location\'s timezone before scheduling sessions' }, { status: 409 })
    const result = await replaceWeeklySchedule(db, {
      organizationId: site.organization_id, productId, locationId: body.location_id,
      timezone: location.timezone, slots, actorId: session.user.id,
    })
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    rethrowHttpError(error)
    console.error('availability_replace_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to save the schedule' }, { status: 500 })
  }
})
