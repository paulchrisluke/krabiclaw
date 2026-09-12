import { queryFirst, type DbClient } from '~/server/db'

export interface ContactSubmissionAssignment {
  selectedLocation: { id: string; title: string } | null
  assignedLocationId: string | null
  error: string | null
}

/**
 * Which location a contact submission belongs to: the one the guest chose, or
 * none.
 *
 * It used to accept a product as well and read a location off it with
 * `(SELECT location_id FROM product_locations ... LIMIT 1)`, then prefer that
 * over the guest's own choice. A product offered at two branches has two
 * locations and that query picked whichever row came back first, so the
 * inquiry landed in an arbitrary inbox. Nothing sends a product here.
 */
export async function resolveContactSubmissionAssignment(
  db: DbClient,
  opts: {
    siteId: string
    locationId?: string | null
  },
): Promise<ContactSubmissionAssignment> {
  if (!opts.locationId) return { selectedLocation: null, assignedLocationId: null, error: null }
  const selectedLocation = await queryFirst<{ id: string; title: string }>(
    db,
    'SELECT id, title FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1',
    [opts.locationId, opts.siteId],
  )
  if (!selectedLocation) {
    return {
      selectedLocation: null,
      assignedLocationId: null,
      error: 'location_id must reference a location on this site',
    }
  }
  return { selectedLocation, assignedLocationId: selectedLocation.id, error: null }
}
