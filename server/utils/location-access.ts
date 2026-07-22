import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { assertLocationAccess, assertSiteContextAccess, assertSiteWideAccess } from '~/server/utils/member-access'
import type { H3Event } from 'h3'

interface SiteAccessRow {
  id: string
  organization_id: string
  member_id: string
  member_role: string
}

interface LocationAccessRow {
  id: string
}

async function loadMemberSiteRow(db: D1Database, siteId: string, userId: string): Promise<SiteAccessRow | null> {
  // No role-name filter here on purpose: access is decided by the caller's
  // requested access class (site-wide / location / context) via
  // member-access.ts, not by which role names are allowed to reach this
  // route. An unrelated org member who isn't owner/admin/editor still fails
  // the scope check inside assertSiteWideAccess/assertLocationAccess/
  // assertSiteContextAccess (isScopedRole/isOrganizationWideRole both false).
  return await queryFirst<SiteAccessRow>(db, `
    SELECT s.id, s.organization_id, om.id AS member_id, om.role AS member_role
    FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ?
    LIMIT 1
  `, [siteId, userId])
}

/**
 * Location management access: org-wide roles, a site-wide-scoped editor, or
 * an editor scoped to this exact location. Use for any resource genuinely
 * owned by one location (menus/media/reviews rows with a location_id set,
 * experiences, bookings, location QA/settings).
 */
export async function requireLocationAccess(event: H3Event, siteId: string, locationId: string) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, message: 'Database not available' })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Authentication required' })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) throw createError({ statusCode: 404, message: 'Site not found or access denied' })

  await assertLocationAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    locationId,
  })

  const location = await queryFirst<LocationAccessRow>(db, `
    SELECT id
    FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [locationId, site.organization_id, siteId])

  if (!location) {
    throw createError({ statusCode: 404, message: 'Location not found' })
  }

  return { env, db, session, site, location }
}

/**
 * Site-wide management access (default): site settings, blog, translations,
 * professional-services, analytics, domains, the contact-submissions inbox.
 * Requires org-wide roles or an editor with a location_id IS NULL scope row
 * for this site — a location-scoped-only editor is rejected here, matching
 * the requirement that they must not reach site-wide managers/settings.
 *
 * Pass `accessClass: 'context'` only for genuine discovery/navigation reads
 * (site metadata needed to resolve into the caller's own location) — never
 * for anything that returns site configuration or other locations' data.
 */
export async function requireSiteAccess(
  event: H3Event,
  siteId: string,
  accessClass: 'site-wide' | 'context' = 'site-wide',
) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, message: 'Database not available' })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, message: 'Authentication required' })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) throw createError({ statusCode: 404, message: 'Site not found or access denied' })

  const principal = { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId }
  if (accessClass === 'context') {
    await assertSiteContextAccess(db, principal)
  } else {
    await assertSiteWideAccess(db, principal)
  }

  return { env, db, session, site }
}
