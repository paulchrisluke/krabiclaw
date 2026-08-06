import { queryFirst, type DbClient } from '~/server/db'

/**
 * Resolves guest-facing contact info for a site, with optional location scoping.
 *
 * Contact details are owned by business_locations and sites. Page blocks only
 * compose a presentation around these canonical records; they do not own a
 * second copy of contact information.
 */
export async function resolveLocationContact(
  db: DbClient,
  siteId: string,
  locationId?: string | null,
): Promise<{ contactPhone: string | null; contactEmail: string | null }> {
  const loc = await queryFirst<{ phone: string | null; email: string | null }>(
    db,
    locationId
      ? `SELECT phone, email FROM business_locations WHERE id = ? AND site_id = ? AND status = 'active' LIMIT 1`
      : `SELECT phone, email FROM business_locations WHERE site_id = ? AND status = 'active' ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    locationId ? [locationId, siteId] : [siteId],
  )
  const site = await queryFirst<{ contact_email: string | null }>(db, 'SELECT contact_email FROM sites WHERE id = ? LIMIT 1', [siteId])
  return {
    contactPhone: loc?.phone ?? null,
    contactEmail: loc?.email ?? site?.contact_email ?? null,
  }
}
