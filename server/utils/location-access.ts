import { HTTPError } from 'nitro';

import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { queryFirst, type DbClient } from '~/server/db'
import { oncePerRequest } from '~/server/utils/request-scope'
import { assertLocationAccess, assertOrganizationContextAccess, assertOrganizationWideAccess, memberAccessPrincipal, resolveOrganizationMembership, type ResolvedMembership } from '~/server/utils/member-access'
import type { H3Event } from 'nitro';
import { getDashboardContext } from '~/server/utils/dashboard-context'

/**
 * The tenant row plus the membership the request was authorized by.
 *
 * `id` is the organization id. There is no separate site id beside it any
 * more, and `name` is the business's own name — what `sites.brand_name` used
 * to hold — rather than a second display name layered over the organization's.
 */
export interface OrganizationAccessRow {
  id: string
  slug: string
  name: string
  subdomain: string | null
  public_url: string | null
  status: string
  onboarding_status: string | null
  vertical: string | null
  theme_id: string
  feature_overrides: string | null
  user_id: string
  member_role: string
  // The membership this row's access was resolved from, keyed by
  // (organization id, user id). Pass it to memberAccessPrincipal rather than
  // reassembling a principal out of user_id/member_role — that is the pairing
  // nothing else can check.
  membership: ResolvedMembership
}

interface LocationAccessRow {
  id: string
}

export function loadMemberOrganizationRow(event: H3Event, db: DbClient, env: CloudflareEnv, organizationId: string, userId: string): Promise<OrganizationAccessRow | null> {
  // A dashboard render resolves the same tenant and membership three or four
  // times: the editor context loader, the pages list and the page itself each
  // call requireOrganizationAccess independently. Neither the organization row
  // nor the membership can change mid-request.
  return oncePerRequest(event, `member-organization-row:${organizationId}:${userId}`, () => readMemberOrganizationRow(db, env, organizationId, userId, event))
}

async function readMemberOrganizationRow(db: DbClient, env: CloudflareEnv, organizationId: string, userId: string, event: H3Event): Promise<OrganizationAccessRow | null> {
  // No role-name filter here on purpose: access is decided by the caller's
  // requested access class (organization-wide / location / context) via
  // member-access.ts, not by which role names are allowed to reach this
  // route. An unrelated org member who isn't owner/admin/editor still fails
  // the scope check inside assertOrganizationWideAccess/assertLocationAccess/
  // assertOrganizationContextAccess (isScopedRole/isOrganizationWideRole both false).
  const row = await queryFirst<Omit<OrganizationAccessRow, 'slug' | 'name' | 'user_id' | 'member_role' | 'membership'>>(db, `
    SELECT id, subdomain,
           (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active') AS public_url,
           status, onboarding_status, vertical, theme_id, feature_overrides
    FROM organization WHERE id = ? LIMIT 1
  `, [organizationId])
  if (!row) return null
  const membership = await resolveOrganizationMembership(env, {
    organizationId: row.id,
    userId,
  }, event)
  if (!membership) return null
  return {
    ...row,
    slug: membership.organizationSlug,
    name: membership.organizationName,
    user_id: userId,
    member_role: membership.role,
    membership,
  }
}

/**
 * Location management access: org-wide roles or an editor scoped to this exact
 * location. Use for any resource genuinely owned by one location (Products and
 * reviews with a location_id set, experiences, bookings, location QA/settings).
 */
export async function requireLocationAccess(event: H3Event, organizationId: string, locationId: string) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 500, message: 'Database not available' })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, message: 'Authentication required' })

  const organization = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
  if (!organization) throw new HTTPError({ statusCode: 404, message: 'Not found or access denied' })

  await assertLocationAccess(db, { ...memberAccessPrincipal(organization.membership, { env, event }), locationId })

  const location = await queryFirst<LocationAccessRow>(db, `
    SELECT id
    FROM business_locations
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `, [locationId, organization.id])

  if (!location) {
    throw new HTTPError({ statusCode: 404, message: 'Location not found' })
  }

  return { env, db, session, organization, location }
}

/**
 * Organization-wide management access (default): tenant settings, blog,
 * localized content, professional-services, analytics, domains, the
 * contact-submissions inbox. Requires an org-wide role — an editor is scoped to
 * locations and must not reach tenant configuration.
 *
 * Pass `accessClass: 'context'` for discovery/navigation reads, or to load the
 * authenticated tenant/member principal before a synchronous role check. It
 * must not directly authorize tenant configuration, other locations' data, or a
 * mutation.
 */
export async function requireOrganizationAccess(
  event: H3Event,
  organizationId: string,
  accessClass: 'organization-wide' | 'context' = 'organization-wide',
) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 500, message: 'Database not available' })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, message: 'Authentication required' })

  const organization = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
  if (!organization) throw new HTTPError({ statusCode: 404, message: 'Not found or access denied' })

  const principal = memberAccessPrincipal(organization.membership, { env, event })
  if (accessClass === 'context') {
    await assertOrganizationContextAccess(db, principal)
  } else {
    await assertOrganizationWideAccess(db, principal)
  }

  return { env, db, session, organization }
}

export async function requireRequestedOrganizationWideAccess(event: H3Event, explicitOrganizationId?: string | null) {
  if (explicitOrganizationId) return requireOrganizationAccess(event, explicitOrganizationId)

  const context = await getDashboardContext(event, { requireOrganization: true })
  if (!context.organization) {
    throw new HTTPError({ statusCode: 404, message: 'Not found or access denied' })
  }
  await assertOrganizationWideAccess(context.db, memberAccessPrincipal(context.organization, { env: context.env }))
  return {
    env: context.env,
    db: context.db,
    session: context.session,
    organization: {
      ...context.organization,
      user_id: context.session.user.id,
      member_role: context.organization.role,
      membership: context.organization,
    } satisfies OrganizationAccessRow,
  }
}

export async function requireRequestedLocationAccess(event: H3Event, locationId: string, explicitOrganizationId?: string | null) {
  if (explicitOrganizationId) return requireLocationAccess(event, explicitOrganizationId, locationId)

  const context = await getDashboardContext(event, { requireOrganization: true })
  if (!context.organization) {
    throw new HTTPError({ statusCode: 404, message: 'Not found or access denied' })
  }
  await assertLocationAccess(context.db, {
    ...memberAccessPrincipal(context.organization, { env: context.env }),
    locationId,
  })
  const location = await queryFirst<LocationAccessRow>(context.db, `
    SELECT id FROM business_locations
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `, [locationId, context.organization.id])
  if (!location) throw new HTTPError({ statusCode: 404, message: 'Location not found' })

  return {
    env: context.env,
    db: context.db,
    session: context.session,
    organization: {
      ...context.organization,
      user_id: context.session.user.id,
      member_role: context.organization.role,
      membership: context.organization,
    } satisfies OrganizationAccessRow,
    location,
  }
}
