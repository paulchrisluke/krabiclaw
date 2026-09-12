import { queryFirst, type DbClient } from '~/server/db'

/**
 * The contact details of one location.
 *
 * A session or thread with no location has no location contact, and this
 * returns nulls for it. It deliberately does not reach for the site's own
 * contact details instead: that is a different, separately configured source,
 * and substituting it here would put the head office number on a branch's
 * confirmation email without anyone choosing that.
 */
export async function resolveLocationContact(
  db: DbClient,
  siteId: string,
  locationId: string | null,
): Promise<{ contactPhone: string | null; contactEmail: string | null }> {
  if (!locationId) return { contactPhone: null, contactEmail: null }
  const location = await queryFirst<{ phone: string | null; email: string | null }>(
    db,
    `SELECT phone, email FROM business_locations WHERE id = ? AND site_id = ? AND status = 'active' LIMIT 1`,
    [locationId, siteId],
  )
  return { contactPhone: location?.phone ?? null, contactEmail: location?.email ?? null }
}
