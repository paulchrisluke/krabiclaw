import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { executeBatch } from '~/server/db'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { requireLocationReservationConfig } from '~/server/utils/reservations'
import { LOCATION_RESERVATION_OVERRIDE_STATUSES } from '~/shared/bookings'

interface OverrideChange {
  override_date: string
  time_slot?: string | null
  directive: 'inherit' | 'set'
  status?: string
  capacity?: number | null
  note?: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Open or close specific reservation dates and slots.
 *
 * 'inherit' removes the override so the location's ordinary hours decide
 * again — which is different from setting it open, because a date with no
 * override follows a change to the hours and an opened one does not.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    await requireLocationReservationConfig(db, { organizationId: site.organization_id, locationId })
    const body = await readStrictBody<{ changes: unknown }>(event, { changes: 'unknown' })
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      return jsonResponse({ error: 'At least one change is required' }, { status: 400 })
    }
    const changes = body.changes as OverrideChange[]
    const seen = new Set<string>()
    for (const change of changes) {
      if (!DATE.test(change.override_date)) return jsonResponse({ error: 'override_date must be YYYY-MM-DD' }, { status: 400 })
      if (change.time_slot != null && !TIME.test(change.time_slot)) return jsonResponse({ error: 'time_slot must be HH:MM' }, { status: 400 })
      const key = `${change.override_date}|${change.time_slot ?? ''}`
      if (seen.has(key)) return jsonResponse({ error: `Duplicate change for ${key}` }, { status: 400 })
      seen.add(key)
      if (change.directive === 'set' && !(LOCATION_RESERVATION_OVERRIDE_STATUSES as readonly string[]).includes(String(change.status))) {
        return jsonResponse({ error: `status must be one of: ${LOCATION_RESERVATION_OVERRIDE_STATUSES.join(', ')}` }, { status: 400 })
      }
      if (change.capacity != null && (!Number.isSafeInteger(change.capacity) || change.capacity < 0)) {
        return jsonResponse({ error: 'capacity must be a non-negative integer or null' }, { status: 400 })
      }
    }

    const now = new Date().toISOString()
    await executeBatch(db, changes.map(change => change.directive === 'inherit'
      ? {
          query: `DELETE FROM location_reservation_overrides
                   WHERE organization_id = ? AND location_id = ? AND override_date = ? AND time_slot IS ?`,
          params: [site.organization_id, locationId, change.override_date, change.time_slot ?? null],
        }
      : {
          query: `INSERT INTO location_reservation_overrides
                    (id, organization_id, location_id, override_date, time_slot, status, capacity, note, created_at, updated_at, created_by, updated_by)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (location_id, override_date, time_slot) WHERE time_slot IS NOT NULL DO UPDATE SET
                    status = excluded.status, capacity = excluded.capacity, note = excluded.note,
                    updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          params: [crypto.randomUUID(), site.organization_id, locationId, change.override_date, change.time_slot ?? null,
            change.status, change.capacity ?? null, change.note?.trim() || null, now, now, session.user.id, session.user.id],
        }), { operation: 'Set reservation availability' })
    return jsonResponse({ success: true, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('reservation_availability_write_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to save the reservation calendar' }, { status: 500 })
  }
})
