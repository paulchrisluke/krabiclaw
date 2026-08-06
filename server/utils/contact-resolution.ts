import { queryAll, queryFirst, type DbClient } from '~/server/db'

/**
 * Resolves guest-facing contact info for a site, with optional location scoping.
 *
 * Fallback chain:
 *   1. business_locations.phone / .email  — when locationId is provided
 *   2. site_content contact.phone / contact.email at site level
 *   3. null for both (callers show generic fallback text)
 */
export async function resolveLocationContact(
  db: DbClient,
  siteId: string,
  locationId?: string | null,
): Promise<{ contactPhone: string | null; contactEmail: string | null }> {
  if (locationId) {
    const loc = await queryFirst<{ phone: string | null; email: string | null }>(
      db,
      `SELECT phone, email FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`,
      [locationId, siteId],
    )
    if (loc && (loc.phone || loc.email)) {
      return { contactPhone: loc.phone ?? null, contactEmail: loc.email ?? null }
    }
  }

  const rows = await queryAll<{ field: string; content: string | null }>(
    db,
    `SELECT field, content FROM site_content
     WHERE site_id = ? AND field IN ('contact.phone', 'contact.email') AND location_id IS NULL
     LIMIT 2`,
    [siteId],
  )
  const map = Object.fromEntries((rows ?? []).map((r) => [r.field, r.content]))
  return {
    contactPhone: map['contact.phone'] ?? null,
    contactEmail: map['contact.email'] ?? null,
  }
}
