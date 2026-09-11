import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { updateSession } from '~/server/utils/availability'
import { PRODUCT_SESSION_STATUSES, type ProductSessionStatus } from '~/shared/bookings'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Edit one occurrence: reschedule it, change its seats, or cancel it.
 *
 * This is what replaced the per-date override map. The session is the
 * schedule, so this writes the row bookings already point at, and
 * regeneration will not undo it.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const sessionId = getRouterParam(event, 'sessionId')
  if (!siteId || !sessionId) return jsonResponse({ error: 'Site ID and session ID are required' }, { status: 400 })
  try {
    const { db, session: auth, site } = await requireSiteAccess(event, siteId)
    const body = await readStrictBody<{ starts_at?: unknown; ends_at?: unknown; capacity?: unknown; status?: unknown }>(event, {
      starts_at: 'unknown', ends_at: 'unknown', capacity: 'unknown', status: 'unknown',
    })
    if (body.status !== undefined && !(PRODUCT_SESSION_STATUSES as readonly unknown[]).includes(body.status)) {
      return jsonResponse({ error: `status must be one of: ${PRODUCT_SESSION_STATUSES.join(', ')}` }, { status: 400 })
    }
    await updateSession(db, {
      organizationId: site.organization_id, sessionId, actorId: auth.user.id,
      startsAt: typeof body.starts_at === 'string' ? body.starts_at : undefined,
      endsAt: typeof body.ends_at === 'string' ? body.ends_at : undefined,
      capacity: body.capacity === undefined ? undefined : (body.capacity as number | null),
      status: body.status as ProductSessionStatus | undefined,
    })
    return jsonResponse({ success: true, session_id: sessionId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('session_update_failed', { siteId, sessionId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to update session' }, { status: 500 })
  }
})
