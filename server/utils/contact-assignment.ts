import { queryFirst, type DbClient } from '~/server/db'

export interface ContactSubmissionAssignment {
  selectedLocation: { id: string; title: string } | null
  experience: { id: string; title: string; location_id: string } | null
  assignedLocationId: string | null
  error: string | null
}

export async function resolveContactSubmissionAssignment(
  db: DbClient,
  opts: {
    siteId: string
    locationId?: string | null
    experienceId?: string | null
  },
): Promise<ContactSubmissionAssignment> {
  let selectedLocation: ContactSubmissionAssignment['selectedLocation'] = null
  if (opts.locationId) {
    selectedLocation = await queryFirst<{ id: string; title: string }>(
      db,
      'SELECT id, title FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1',
      [opts.locationId, opts.siteId],
    )
    if (!selectedLocation) {
      return {
        selectedLocation: null,
        experience: null,
        assignedLocationId: null,
        error: 'location_id must reference a location on this site',
      }
    }
  }

  let experience: ContactSubmissionAssignment['experience'] = null
  if (opts.experienceId) {
    experience = await queryFirst<{ id: string; title: string; location_id: string }>(
      db,
      `SELECT p.id, p.name AS title, (SELECT pl.location_id FROM product_locations pl WHERE pl.product_id = p.id AND pl.published = 1 LIMIT 1) AS location_id
         FROM products p JOIN product_publications pub ON pub.product_id = p.id
        WHERE p.id = ? AND pub.site_id = ? LIMIT 1`,
      [opts.experienceId, opts.siteId],
    )
    if (!experience) {
      return {
        selectedLocation,
        experience: null,
        assignedLocationId: null,
        error: 'experience_id must reference an experience on this site',
      }
    }
  }

  return {
    selectedLocation,
    experience,
    assignedLocationId: experience?.location_id ?? selectedLocation?.id ?? null,
    error: null,
  }
}
