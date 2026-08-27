import { HTTPError } from 'nitro';

import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { queryFirst, type DbClient } from '~/server/db'
import { assertLocationAccess, assertSiteContextAccess, assertSiteWideAccess, resolveOrganizationMembership } from '~/server/utils/member-access'
import type { H3Event } from 'nitro';
import { getDashboardContext } from '~/server/utils/dashboard-context'

export interface SiteAccessRow {
  id: string
  organization_id: string
  organization_slug: string
  organization_name: string
  brand_name: string | null
  subdomain: string | null
  public_url: string | null
  status: string
  onboarding_status: string | null
  vertical: string | null
  theme_id: string
  feature_overrides: string | null
  member_id: string
  member_role: string
}

interface LocationAccessRow {
  id: string
}

export async function loadMemberSiteRow(db: DbClient, env: CloudflareEnv, siteId: string, userId: string): Promise<SiteAccessRow | null> {
  // No role-name filter here on purpose: access is decided by the caller's
  // requested access class (site-wide / location / context) via
  // member-access.ts, not by which role names are allowed to reach this
  // route. An unrelated org member who isn't owner/admin/editor still fails
  // the scope check inside assertSiteWideAccess/assertLocationAccess/
  // assertSiteContextAccess (isScopedRole/isOrganizationWideRole both false).
  const site = await queryFirst<Omit<SiteAccessRow, 'organization_slug' | 'organization_name' | 'member_id' | 'member_role'>>(db, `
    SELECT id, organization_id, brand_name, subdomain, public_url, status, onboarding_status,
           vertical, theme_id, feature_overrides
    FROM sites WHERE id = ? LIMIT 1
  `, [siteId])
  if (!site) return null
  const membership = await resolveOrganizationMembership(env, {
    organizationId: site.organization_id,
    userId,
  })
  if (!membership) return null
  return {
    ...site,
    organization_slug: membership.organizationSlug,
    organization_name: membership.organizationName,
    member_id: membership.memberId,
    member_role: membership.role,
  }
}

/**
 * Location management access: org-wide roles, a site-wide-scoped editor, or
 * an editor scoped to this exact location. Use for any resource genuinely
 * owned by one location (menus and reviews with a location_id set,
 * experiences, bookings, location QA/settings).
 */
export async function requireLocationAccess(event: H3Event, siteId: string, locationId: string) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 500, message: 'Database not available' })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, message: 'Authentication required' })

  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })

  await assertLocationAccess(db, {
    env,
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
    throw new HTTPError({ statusCode: 404, message: 'Location not found' })
  }

  return { env, db, session, site, location }
}

/**
 * Site-wide management access (default): site settings, blog, localized content,
 * professional-services, analytics, domains, the contact-submissions inbox.
 * Requires org-wide roles or an editor with a location_id IS NULL scope row
 * for this site — a location-scoped-only editor is rejected here, matching
 * the requirement that they must not reach site-wide managers/settings.
 *
 * Pass `accessClass: 'context'` for discovery/navigation reads, or to load the
 * authenticated site/member principal before a synchronous
 * `assertOrganizationAccess(site.member_role)` check. It must not directly
 * authorize site configuration, other locations' data, or a mutation.
 */
export async function requireSiteAccess(
  event: H3Event,
  siteId: string,
  accessClass: 'site-wide' | 'context' = 'site-wide',
) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 500, message: 'Database not available' })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, message: 'Authentication required' })

  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })

  const principal = { env, memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId }
  if (accessClass === 'context') {
    await assertSiteContextAccess(db, principal)
  } else {
    await assertSiteWideAccess(db, principal)
  }

  return { env, db, session, site }
}

export async function requireRequestedSiteWideAccess(event: H3Event, explicitSiteId?: string | null) {
  if (explicitSiteId) return requireSiteAccess(event, explicitSiteId)

  const context = await getDashboardContext(event, { requireSite: true })
  if (!context.organization || !context.site) {
    throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })
  }
  await assertSiteWideAccess(context.db, {
    env: context.env,
    memberId: context.organization.memberId,
    role: context.organization.role,
    organizationId: context.organization.id,
    siteId: context.site.id,
  })
  return {
    env: context.env,
    db: context.db,
    session: context.session,
    site: {
      ...context.site,
      organization_slug: context.organization.slug,
      organization_name: context.organization.name,
      member_id: context.organization.memberId,
      member_role: context.organization.role,
    } satisfies SiteAccessRow,
  }
}

export async function requireRequestedLocationAccess(event: H3Event, locationId: string, explicitSiteId?: string | null) {
  if (explicitSiteId) return requireLocationAccess(event, explicitSiteId, locationId)

  const context = await getDashboardContext(event, { requireSite: true })
  if (!context.organization || !context.site) {
    throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })
  }
  await assertLocationAccess(context.db, {
    env: context.env,
    memberId: context.organization.memberId,
    role: context.organization.role,
    organizationId: context.organization.id,
    siteId: context.site.id,
    locationId,
  })
  const location = await queryFirst<LocationAccessRow>(context.db, `
    SELECT id FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [locationId, context.organization.id, context.site.id])
  if (!location) throw new HTTPError({ statusCode: 404, message: 'Location not found' })

  return {
    env: context.env,
    db: context.db,
    session: context.session,
    site: {
      ...context.site,
      organization_slug: context.organization.slug,
      organization_name: context.organization.name,
      member_id: context.organization.memberId,
      member_role: context.organization.role,
    } satisfies SiteAccessRow,
    location,
  }
}
